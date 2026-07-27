data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  name_prefix      = "${var.project_name}-${var.environment}"
  azs              = slice(data.aws_availability_zones.available.names, 0, 2)
  root_domain_name = trimsuffix(var.root_domain_name, ".")
  app_domain_name  = local.root_domain_name

  common_tags = {
    Project     = "jungle-init"
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = var.github_repository
    Owner       = "A"
  }

  public_subnets = {
    for idx, cidr in var.public_subnet_cidrs : "public-${idx + 1}" => {
      cidr_block = cidr
      az         = local.azs[idx]
    }
  }

  private_app_subnets = {
    for idx, cidr in var.private_app_subnet_cidrs : "app-${idx + 1}" => {
      cidr_block = cidr
      az         = local.azs[idx]
    }
  }

  private_data_subnets = {
    for idx, cidr in var.private_data_subnet_cidrs : "data-${idx + 1}" => {
      cidr_block = cidr
      az         = local.azs[idx]
    }
  }

  services = {
    frontend = {
      container_name = "frontend"
      port           = 3000
      cpu            = 512
      memory         = 1024
      health_path    = "/"
    }
    api = {
      container_name = "api"
      port           = 3001
      cpu            = 512
      memory         = 1024
      health_path    = "/api/v1/health"
    }
    worker = {
      container_name = "worker"
      port           = null
      cpu            = 1024
      memory         = 2048
      health_path    = null
    }
  }

  static_environment = {
    frontend = {
      NODE_ENV = "production"
      PORT     = "3000"
    }
    api = {
      NODE_ENV = "production"
      PORT     = "3001"
    }
    worker = {
      NODE_ENV               = "production"
      WORKER_REPOSITORY_MODE = "prisma"
    }
  }

  secret_keys = {
    frontend = [
      "NEXT_PUBLIC_API_BASE_URL"
    ]
    api = [
      "DATABASE_URL",
      "REDIS_URL",
      "JWT_SECRET",
      "JWT_ACCESS_TOKEN_TTL",
      "JWT_REFRESH_TOKEN_TTL",
      "AUTH_REFRESH_COOKIE_NAME",
      "AUTH_COOKIE_SECURE",
      "AUTH_COOKIE_SAME_SITE",
      "FRONTEND_ORIGIN",
      "FRONTEND_ALLOWED_ORIGINS",
      "APP_FRONTEND_URL",
      "PUBLIC_APPLICATION_MAGIC_LINK_TTL_SECONDS",
      "PUBLIC_APPLICATION_TOKEN_VERIFY_URL",
      "PUBLIC_APPLICATION_TOKEN_VERIFY_SECRET",
      "PUBLIC_APPLICATION_TOKEN_SECRET",
      "PUBLIC_INTERVIEW_ACCESS_TOKEN_SECRET",
      "PUBLIC_INTERVIEW_ACCESS_TOKEN_TTL_SECONDS",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_CALLBACK_URL",
      "TOSS_SECRET_KEY",
      "TOSS_API_BASE_URL",
      "PAYMENT_DEV_PASS_GRANT_ENABLED",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_SECURE",
      "SMTP_REQUIRE_TLS",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_FROM",
      "SMTP_CONNECTION_TIMEOUT_MS",
      "SMTP_GREETING_TIMEOUT_MS",
      "SMTP_SOCKET_TIMEOUT_MS",
      "AWS_REGION",
      "S3_BUCKET",
      "S3_BUCKET_NAME",
      "S3_PUBLIC_BASE_URL",
      "AI_SQS_QUEUE_URL",
      "SQS_QUEUE_URL",
      "OPENAI_API_KEY",
      "AI_PROVIDER_API_KEY",
      "AI_PROVIDER_MODE",
      "OPENAI_MODEL",
      "OPENAI_EMBEDDING_MODEL",
      "AI_INTERVIEWER_REALTIME_PROVIDER",
      "OPENAI_REALTIME_MODEL",
      "OPENAI_REALTIME_VOICE",
      "OPENAI_REALTIME_API_BASE_URL",
      "OPENAI_REALTIME_STT_MODEL",
      "OPENAI_REALTIME_STT_DELAY",
      "AI_STT_PROVIDER",
      "OPENAI_STT_MODEL",
      "OPENAI_STT_LANGUAGE",
      "OPENAI_STT_TIMEOUT_MS",
      "MAX_UPLOAD_BYTES",
      "COMPANY_LOGO_MAX_UPLOAD_BYTES",
      "JD_IMAGE_MAX_UPLOAD_BYTES",
      "PUBLIC_APPLICATION_DOCUMENT_MAX_UPLOAD_BYTES",
      "SIGNED_URL_TTL_SECONDS"
    ]
    worker = [
      "DATABASE_URL",
      "AWS_REGION",
      "S3_BUCKET",
      "S3_BUCKET_NAME",
      "AI_SQS_QUEUE_URL",
      "SQS_QUEUE_URL",
      "OPENAI_API_KEY",
      "AI_PROVIDER_API_KEY",
      "AI_PROVIDER_MODE",
      "OPENAI_MODEL",
      "OPENAI_EMBEDDING_MODEL",
      "AI_TEXT_INPUT_USD_PER_1M_TOKENS",
      "AI_TEXT_OUTPUT_USD_PER_1M_TOKENS",
      "AI_STT_USD_PER_MINUTE",
      "AI_STT_PROVIDER",
      "OPENAI_STT_MODEL",
      "OPENAI_STT_LANGUAGE",
      "OPENAI_STT_TIMEOUT_MS",
      "WORKER_CONCURRENCY",
      "WORKER_BATCH_SIZE",
      "WORKER_MAX_RETRYABLE_RECEIVES",
      "WORKER_POLL_INTERVAL_MS",
      "WORKER_VISIBILITY_TIMEOUT_SECONDS",
      "WORKER_VISIBILITY_HEARTBEAT_MS"
    ]
  }

  interface_endpoint_services = {
    ecr_api        = "ecr.api"
    ecr_dkr        = "ecr.dkr"
    logs           = "logs"
    secretsmanager = "secretsmanager"
    sqs            = "sqs"
  }

  github_oidc_provider_arn = (
    var.github_oidc_provider_arn != ""
    ? var.github_oidc_provider_arn
    : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  )
  github_deploy_environment_name = (
    var.github_deploy_environment_name != ""
    ? var.github_deploy_environment_name
    : local.name_prefix
  )
}
