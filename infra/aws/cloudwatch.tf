resource "aws_cloudwatch_log_group" "ecs" {
  for_each = local.services

  name              = "/ecs/${var.project_name}/${var.environment}/${each.key}"
  retention_in_days = 30

  tags = {
    Name    = "${local.name_prefix}-${each.key}-logs"
    Service = each.key
  }
}

resource "aws_sns_topic" "ops_alerts" {
  name = "${local.name_prefix}-ops-alerts"

  tags = {
    Name      = "${local.name_prefix}-ops-alerts"
    Component = "observability"
  }
}

resource "aws_chatbot_slack_channel_configuration" "ops_alerts" {
  provider = aws.us_east_2

  configuration_name = "${local.name_prefix}-ops-alerts"
  iam_role_arn       = aws_iam_role.chatbot.arn
  slack_channel_id   = var.slack_channel_id
  slack_team_id      = var.slack_team_id
  sns_topic_arns     = [aws_sns_topic.ops_alerts.arn]

  guardrail_policy_arns       = ["arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess"]
  logging_level               = "NONE"
  user_authorization_required = false

  tags = {
    Name      = "${local.name_prefix}-ops-alerts"
    Component = "observability"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  alarm_name          = "${local.name_prefix}-alb-target-5xx"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
  ok_actions          = [aws_sns_topic.ops_alerts.arn]
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

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  for_each = {
    frontend = aws_lb_target_group.frontend.arn_suffix
    api      = aws_lb_target_group.api.arn_suffix
  }

  alarm_name          = "${local.name_prefix}-${each.key}-unhealthy-hosts"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
  ok_actions          = [aws_sns_topic.ops_alerts.arn]
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
    TargetGroup  = each.value
  }

  tags = {
    Name      = "${local.name_prefix}-${each.key}-unhealthy-hosts"
    Component = "alb"
    Service   = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_response_time_p95" {
  alarm_name          = "${local.name_prefix}-alb-target-response-time-p95"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
  ok_actions          = [aws_sns_topic.ops_alerts.arn]
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  extended_statistic  = "p95"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  threshold           = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
  }

  tags = {
    Name      = "${local.name_prefix}-alb-target-response-time-p95"
    Component = "alb"
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_oldest_message" {
  alarm_name          = "${local.name_prefix}-sqs-oldest-message"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
  ok_actions          = [aws_sns_topic.ops_alerts.arn]
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

resource "aws_cloudwatch_metric_alarm" "sqs_dlq_visible_messages" {
  alarm_name          = "${local.name_prefix}-sqs-dlq-visible-messages"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
  ok_actions          = [aws_sns_topic.ops_alerts.arn]
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.ai_jobs_dlq.name
  }

  tags = {
    Name      = "${local.name_prefix}-sqs-dlq-visible-messages"
    Component = "sqs"
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name_prefix}-rds-cpu"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
  ok_actions          = [aws_sns_topic.ops_alerts.arn]
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

resource "aws_cloudwatch_dashboard" "overview" {
  dashboard_name = "${local.name_prefix}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 2
        properties = {
          markdown = "# ${local.name_prefix} operations overview\nCloudWatch metrics for CloudFront, ALB, ECS, RDS, Valkey, and SQS. Slack alerts are routed through SNS topic `${aws_sns_topic.ops_alerts.name}`."
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 2
        width  = 12
        height = 6
        properties = {
          title   = "CloudFront traffic and errors"
          view    = "timeSeries"
          stacked = false
          region  = "us-east-1"
          period  = 300
          metrics = [
            ["AWS/CloudFront", "Requests", "Region", "Global", "DistributionId", aws_cloudfront_distribution.app.id, { stat = "Sum" }],
            [".", "4xxErrorRate", ".", ".", ".", ".", { stat = "Average", yAxis = "right" }],
            [".", "5xxErrorRate", ".", ".", ".", ".", { stat = "Average", yAxis = "right" }]
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 2
        width  = 12
        height = 6
        properties = {
          title   = "ALB traffic, 5xx, and p95 latency"
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          period  = 300
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Sum" }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { stat = "Sum", yAxis = "right" }],
            [".", "TargetResponseTime", ".", ".", { stat = "p95", yAxis = "right" }]
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 8
        width  = 12
        height = 6
        properties = {
          title   = "ALB target health"
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          period  = 60
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "LoadBalancer", aws_lb.app.arn_suffix, "TargetGroup", aws_lb_target_group.frontend.arn_suffix, { label = "frontend healthy", stat = "Average" }],
            [".", "UnHealthyHostCount", ".", ".", ".", ".", { label = "frontend unhealthy", stat = "Maximum", yAxis = "right" }],
            [".", "HealthyHostCount", ".", ".", "TargetGroup", aws_lb_target_group.api.arn_suffix, { label = "api healthy", stat = "Average" }],
            [".", "UnHealthyHostCount", ".", ".", ".", ".", { label = "api unhealthy", stat = "Maximum", yAxis = "right" }]
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 8
        width  = 12
        height = 6
        properties = {
          title   = "ECS service CPU and memory"
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          period  = 300
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.app.name, "ServiceName", aws_ecs_service.service["frontend"].name, { label = "frontend cpu", stat = "Average" }],
            [".", "MemoryUtilization", ".", ".", ".", ".", { label = "frontend memory", stat = "Average" }],
            [".", "CPUUtilization", ".", ".", "ServiceName", aws_ecs_service.api.name, { label = "api cpu", stat = "Average" }],
            [".", "MemoryUtilization", ".", ".", ".", ".", { label = "api memory", stat = "Average" }],
            [".", "CPUUtilization", ".", ".", "ServiceName", aws_ecs_service.service["worker"].name, { label = "worker cpu", stat = "Average" }],
            [".", "MemoryUtilization", ".", ".", ".", ".", { label = "worker memory", stat = "Average" }]
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 12
        height = 6
        properties = {
          title   = "RDS PostgreSQL"
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          period  = 300
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.app.id, { stat = "Average" }],
            [".", "DatabaseConnections", ".", ".", { stat = "Average", yAxis = "right" }],
            [".", "FreeStorageSpace", ".", ".", { stat = "Average", yAxis = "right" }],
            [".", "FreeableMemory", ".", ".", { stat = "Average", yAxis = "right" }]
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 14
        width  = 12
        height = 6
        properties = {
          title   = "ElastiCache Valkey"
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          period  = 300
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", one(tolist(aws_elasticache_replication_group.redis.member_clusters)), { stat = "Average" }],
            [".", "DatabaseMemoryUsagePercentage", ".", ".", { stat = "Average", yAxis = "right" }],
            [".", "CurrConnections", ".", ".", { stat = "Average", yAxis = "right" }],
            [".", "Evictions", ".", ".", { stat = "Sum", yAxis = "right" }]
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 20
        width  = 24
        height = 6
        properties = {
          title   = "SQS AI jobs and DLQ"
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          period  = 300
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.ai_jobs.name, { label = "main visible", stat = "Maximum" }],
            [".", "ApproximateNumberOfMessagesNotVisible", ".", ".", { label = "main in flight", stat = "Maximum" }],
            [".", "ApproximateAgeOfOldestMessage", ".", ".", { label = "main oldest age", stat = "Maximum", yAxis = "right" }],
            [".", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.ai_jobs_dlq.name, { label = "dlq visible", stat = "Maximum" }]
          ]
        }
      }
    ]
  })
}
