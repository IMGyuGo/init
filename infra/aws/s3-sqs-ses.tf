resource "aws_s3_bucket" "assets" {
  bucket = "${local.name_prefix}-assets-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${local.name_prefix}-assets"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = var.asset_bucket_versioning_status
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST"]
    allowed_origins = ["https://${local.app_domain_name}"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_sqs_queue" "ai_jobs_dlq" {
  name                      = "${local.name_prefix}-ai-jobs-dlq"
  message_retention_seconds = 345600
  sqs_managed_sse_enabled   = true

  tags = {
    Name = "${local.name_prefix}-ai-jobs-dlq"
  }
}

resource "aws_sqs_queue" "ai_jobs" {
  name                       = "${local.name_prefix}-ai-jobs"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 900
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ai_jobs_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${local.name_prefix}-ai-jobs"
  }
}

resource "aws_ses_domain_identity" "mail" {
  count = local.ses_enabled ? 1 : 0

  domain = local.ses_domain_name
}

resource "aws_route53_record" "ses_domain_verification" {
  count = local.ses_enabled ? 1 : 0

  allow_overwrite = true
  name            = "_amazonses.${local.ses_domain_name}"
  records         = [aws_ses_domain_identity.mail[0].verification_token]
  ttl             = 600
  type            = "TXT"
  zone_id         = data.aws_route53_zone.root.zone_id
}

resource "aws_ses_domain_identity_verification" "mail" {
  count = local.ses_enabled ? 1 : 0

  domain = aws_ses_domain_identity.mail[0].domain

  depends_on = [aws_route53_record.ses_domain_verification]
}

resource "aws_ses_domain_dkim" "mail" {
  count = local.ses_enabled ? 1 : 0

  domain = aws_ses_domain_identity.mail[0].domain
}

resource "aws_route53_record" "ses_dkim" {
  count = local.ses_enabled ? 3 : 0

  allow_overwrite = true
  name            = "${aws_ses_domain_dkim.mail[0].dkim_tokens[count.index]}._domainkey.${local.ses_domain_name}"
  records         = ["${aws_ses_domain_dkim.mail[0].dkim_tokens[count.index]}.dkim.amazonses.com"]
  ttl             = 600
  type            = "CNAME"
  zone_id         = data.aws_route53_zone.root.zone_id
}

resource "aws_ses_domain_mail_from" "mail" {
  count = local.ses_enabled && local.ses_mail_from_domain != "" ? 1 : 0

  behavior_on_mx_failure = var.ses_mail_from_behavior_on_mx_failure
  domain                 = aws_ses_domain_identity.mail[0].domain
  mail_from_domain       = local.ses_mail_from_domain
}

resource "aws_route53_record" "ses_mail_from_mx" {
  count = local.ses_enabled && local.ses_mail_from_domain != "" ? 1 : 0

  allow_overwrite = true
  name            = local.ses_mail_from_domain
  records         = ["10 feedback-smtp.${data.aws_region.current.region}.amazonses.com"]
  ttl             = 600
  type            = "MX"
  zone_id         = data.aws_route53_zone.root.zone_id
}

resource "aws_route53_record" "ses_mail_from_spf" {
  count = local.ses_enabled && local.ses_mail_from_domain != "" ? 1 : 0

  allow_overwrite = true
  name            = local.ses_mail_from_domain
  records         = ["v=spf1 include:amazonses.com ~all"]
  ttl             = 600
  type            = "TXT"
  zone_id         = data.aws_route53_zone.root.zone_id
}
