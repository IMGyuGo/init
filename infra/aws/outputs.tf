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
  value = {
    for name, service in aws_ecs_service.service : name => service.name
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
