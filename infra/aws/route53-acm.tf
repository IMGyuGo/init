data "aws_route53_zone" "root" {
  name         = local.root_domain_name
  private_zone = false
}

resource "aws_acm_certificate" "cloudfront" {
  provider = aws.us_east_1

  domain_name       = local.app_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${local.name_prefix}-cloudfront"
  }
}

resource "aws_route53_record" "cloudfront_cert_validation" {
  for_each = {
    for option in aws_acm_certificate.cloudfront.domain_validation_options :
    option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.root.zone_id
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [
    for record in aws_route53_record.cloudfront_cert_validation : record.fqdn
  ]
}

resource "aws_route53_record" "app_a" {
  name    = local.app_domain_name
  type    = "A"
  zone_id = data.aws_route53_zone.root.zone_id

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
  }
}

resource "aws_route53_record" "app_aaaa" {
  name    = local.app_domain_name
  type    = "AAAA"
  zone_id = data.aws_route53_zone.root.zone_id

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
  }
}
