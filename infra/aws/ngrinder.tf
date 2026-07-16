data "aws_ami" "amazon_linux_2023" {
  count = var.enable_ngrinder ? 1 : 0

  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "ngrinder" {
  count = var.enable_ngrinder ? 1 : 0

  ami                         = data.aws_ami.amazon_linux_2023[0].id
  instance_type               = var.ngrinder_instance_type
  subnet_id                   = aws_subnet.public[var.ngrinder_subnet_key].id
  vpc_security_group_ids      = [aws_security_group.ngrinder[0].id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.ngrinder[0].name
  monitoring                  = true
  user_data_replace_on_change = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_size           = var.ngrinder_root_volume_size_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    exec > >(tee /var/log/ngrinder-user-data.log | logger -t ngrinder-user-data -s 2>/dev/console) 2>&1

    dnf update -y
    dnf install -y amazon-ssm-agent gzip java-17-amazon-corretto-headless shadow-utils tar

    systemctl enable --now amazon-ssm-agent

    id ngrinder >/dev/null 2>&1 || useradd --system --home-dir /var/lib/ngrinder --shell /sbin/nologin ngrinder

    mkdir -p /opt/ngrinder /opt/ngrinder-agent /var/lib/ngrinder /var/log/ngrinder
    curl -fL --retry 5 --retry-delay 10 -o /opt/ngrinder/ngrinder-controller.war "${var.ngrinder_controller_download_url}"
    chown -R ngrinder:ngrinder /opt/ngrinder /opt/ngrinder-agent /var/lib/ngrinder /var/log/ngrinder

    cat >/etc/systemd/system/ngrinder-controller.service <<'UNIT'
    [Unit]
    Description=nGrinder Controller
    After=network-online.target
    Wants=network-online.target

    [Service]
    User=ngrinder
    Group=ngrinder
    Environment=NGRINDER_HOME=/var/lib/ngrinder
    ExecStart=/usr/bin/java -Xms512m -Xmx1536m -Djava.io.tmpdir=/var/lib/ngrinder/lib -jar /opt/ngrinder/ngrinder-controller.war --port ${var.ngrinder_controller_port}
    Restart=always
    RestartSec=10
    SuccessExitStatus=143
    LimitNOFILE=16000
    LimitNPROC=32768

    [Install]
    WantedBy=multi-user.target
    UNIT

    cat >/usr/local/bin/install-ngrinder-agent.sh <<'AGENT_INSTALL'
    #!/bin/bash
    set -euxo pipefail

    cd /opt/ngrinder-agent
    rm -f ngrinder-agent.tar

    for i in $(seq 1 60); do
      if curl -fL --connect-timeout 5 -o ngrinder-agent.tar "http://127.0.0.1:${var.ngrinder_controller_port}/agent/download"; then
        break
      fi
      sleep 10
    done

    test -s ngrinder-agent.tar
    tar -xf ngrinder-agent.tar

    agent_run_script="$(find /opt/ngrinder-agent -maxdepth 3 -type f -name run_agent.sh | head -n 1)"
    test -n "$agent_run_script"
    chmod +x "$agent_run_script"
    chown -R ngrinder:ngrinder /opt/ngrinder-agent
    AGENT_INSTALL

    cat >/usr/local/bin/run-ngrinder-agent.sh <<'AGENT_RUN'
    #!/bin/bash
    set -euo pipefail

    agent_run_script="$(find /opt/ngrinder-agent -maxdepth 3 -type f -name run_agent.sh | head -n 1)"
    test -n "$agent_run_script"
    cd "$(dirname "$agent_run_script")"
    exec /bin/bash "$agent_run_script"
    AGENT_RUN

    chmod +x /usr/local/bin/install-ngrinder-agent.sh /usr/local/bin/run-ngrinder-agent.sh

    cat >/etc/systemd/system/ngrinder-agent.service <<'UNIT'
    [Unit]
    Description=nGrinder Local Agent
    After=ngrinder-controller.service
    Wants=ngrinder-controller.service

    [Service]
    User=ngrinder
    Group=ngrinder
    ExecStartPre=/usr/local/bin/install-ngrinder-agent.sh
    ExecStart=/usr/local/bin/run-ngrinder-agent.sh
    Restart=always
    RestartSec=10
    LimitNOFILE=16000
    LimitNPROC=32768

    [Install]
    WantedBy=multi-user.target
    UNIT

    systemctl daemon-reload
    systemctl enable --now ngrinder-controller

    if [ "${var.ngrinder_agent_enabled}" = "true" ]; then
      systemctl enable --now ngrinder-agent
    fi
  EOF

  tags = {
    Name    = "${local.name_prefix}-ngrinder"
    Service = "ngrinder"
    Purpose = "load-test"
  }
}
