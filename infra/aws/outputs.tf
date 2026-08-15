output "environment" {
  value = var.environment
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.app.domain_name
}

output "application_domain_name" {
  value = local.app_domain_name
}

output "application_url" {
  value = "https://${local.app_domain_name}"
}

output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "ecr_repository_urls" {
  value = {
    for name, repo in aws_ecr_repository.service : name => repo.repository_url
  }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.app.name
}

output "ecs_service_names" {
  value = merge(
    { api = aws_ecs_service.api.name },
    { for name, service in aws_ecs_service.service : name => service.name }
  )
}

output "api_autoscaling" {
  value = {
    resource_id                = aws_appautoscaling_target.api.resource_id
    min_capacity               = aws_appautoscaling_target.api.min_capacity
    max_capacity               = aws_appautoscaling_target.api.max_capacity
    cpu_target_percent         = var.api_autoscaling.cpu_target_percent
    scale_out_cooldown_seconds = var.api_autoscaling.scale_out_cooldown_seconds
    scale_in_cooldown_seconds  = var.api_autoscaling.scale_in_cooldown_seconds
  }
}

output "runtime_secret_arns" {
  value = {
    for name, secret in aws_secretsmanager_secret.runtime : name => secret.arn
  }
}

output "asset_bucket_name" {
  value = aws_s3_bucket.assets.bucket
}

output "ai_jobs_queue_url" {
  value = aws_sqs_queue.ai_jobs.url
}

output "rds_endpoint" {
  value = aws_db_instance.app.endpoint
}

output "rds_master_secret_arn" {
  value     = try(aws_db_instance.app.master_user_secret[0].secret_arn, null)
  sensitive = true
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "ops_alerts_topic_arn" {
  value = aws_sns_topic.ops_alerts.arn
}

output "cloudwatch_dashboard_name" {
  value = aws_cloudwatch_dashboard.overview.dashboard_name
}

output "chatbot_slack_channel_configuration_arn" {
  value = aws_chatbot_slack_channel_configuration.ops_alerts.chat_configuration_arn
}

output "ngrinder_instance_id" {
  value = var.enable_ngrinder ? aws_instance.ngrinder[0].id : null
}

output "ngrinder_public_ip" {
  value = var.enable_ngrinder ? aws_instance.ngrinder[0].public_ip : null
}

output "ngrinder_controller_url" {
  value = var.enable_ngrinder ? "http://${aws_instance.ngrinder[0].public_dns}:${var.ngrinder_controller_port}" : null
}

output "playwright_loadtest_instance_ids" {
  value = var.enable_playwright_loadtest ? aws_instance.playwright_loadtest[*].id : []
}

output "playwright_loadtest_public_ips" {
  value = var.enable_playwright_loadtest ? aws_instance.playwright_loadtest[*].public_ip : []
}

output "playwright_loadtest_row_ranges" {
  value = var.enable_playwright_loadtest ? {
    for idx, instance in aws_instance.playwright_loadtest : instance.id => {
      instance_index = idx + 1
      row_start      = idx * var.playwright_loadtest_rows_per_instance + 1
      row_end        = (idx + 1) * var.playwright_loadtest_rows_per_instance
    }
  } : {}
}
