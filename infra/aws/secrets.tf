resource "aws_secretsmanager_secret" "runtime" {
  for_each = local.services

  name                    = "${var.project_name}/${var.environment}/${each.key}"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}/${var.environment}/${each.key}"
  }
}
