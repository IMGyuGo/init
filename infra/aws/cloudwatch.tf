resource "aws_cloudwatch_log_group" "ecs" {
  for_each = local.services

  name              = "/ecs/${var.project_name}/${var.environment}/${each.key}"
  retention_in_days = var.environment == "main" ? 30 : 14

  tags = {
    Name    = "${local.name_prefix}-${each.key}-logs"
    Service = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  alarm_name          = "${local.name_prefix}-alb-target-5xx"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
  }

  tags = {
    Name      = "${local.name_prefix}-alb-target-5xx"
    Component = "alb"
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_oldest_message" {
  alarm_name          = "${local.name_prefix}-sqs-oldest-message"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 900
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.ai_jobs.name
  }

  tags = {
    Name      = "${local.name_prefix}-sqs-oldest-message"
    Component = "sqs"
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name_prefix}-rds-cpu"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.app.id
  }

  tags = {
    Name      = "${local.name_prefix}-rds-cpu"
    Component = "rds"
  }
}
