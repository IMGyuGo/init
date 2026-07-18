data "aws_ami" "playwright_loadtest_amazon_linux_2023" {
  count = var.enable_playwright_loadtest && var.playwright_loadtest_instance_count > 0 ? 1 : 0

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

resource "aws_instance" "playwright_loadtest" {
  count = var.enable_playwright_loadtest ? var.playwright_loadtest_instance_count : 0

  ami           = data.aws_ami.playwright_loadtest_amazon_linux_2023[0].id
  instance_type = var.playwright_loadtest_instance_type
  subnet_id = aws_subnet.public[
    var.playwright_loadtest_subnet_keys[count.index % length(var.playwright_loadtest_subnet_keys)]
  ].id
  vpc_security_group_ids      = [aws_security_group.playwright_loadtest[0].id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.playwright_loadtest[0].name
  monitoring                  = true
  user_data_replace_on_change = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_size           = var.playwright_loadtest_root_volume_size_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/templates/playwright-loadtest-user-data.sh.tftpl", {
    package_json_gz_b64      = base64gzip(file("${path.module}/../../tools/realtime-playwright/package.json"))
    playwright_config_gz_b64 = base64gzip(file("${path.module}/../../tools/realtime-playwright/playwright.config.ts"))
    realtime_spec_gz_b64     = base64gzip(file("${path.module}/../../tools/realtime-playwright/tests/realtime-session-hold.spec.ts"))
    instance_index           = count.index + 1
    token_row_start          = count.index * var.playwright_loadtest_rows_per_instance + 1
    token_row_end            = (count.index + 1) * var.playwright_loadtest_rows_per_instance
    playwright_base_url      = "https://${local.app_domain_name}"
    playwright_api_base_url  = "http://${aws_lb.app.dns_name}/api/v1"
    playwright_csv_path      = "/opt/playwright-loadtest/interview_tokens.csv"
    playwright_workers       = 1
    playwright_hold_seconds  = 300
  })

  tags = {
    Name     = "${local.name_prefix}-playwright-loadtest-${format("%02d", count.index + 1)}"
    Service  = "playwright-loadtest"
    Purpose  = "realtime-interview-load-test"
    RowStart = tostring(count.index * var.playwright_loadtest_rows_per_instance + 1)
    RowEnd   = tostring((count.index + 1) * var.playwright_loadtest_rows_per_instance)
  }
}
