data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Public ALB ingress restricted to CloudFront by default"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_cloudfront" {
  security_group_id = aws_security_group.alb.id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id
  from_port         = 80
  ip_protocol       = "tcp"
  to_port           = 80

  tags = {
    Name   = "${local.name_prefix}-alb-http-cloudfront"
    Source = "cloudfront"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_admin" {
  for_each = toset(var.admin_cidr_blocks)

  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = each.value
  from_port         = 80
  ip_protocol       = "tcp"
  to_port           = 80

  tags = {
    Name   = "${local.name_prefix}-alb-http-admin"
    Source = each.value
  }
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name = "${local.name_prefix}-alb-all-egress"
  }
}

resource "aws_security_group" "ecs_frontend" {
  name        = "${local.name_prefix}-ecs-frontend"
  description = "Frontend ECS task ingress from ALB"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-ecs-frontend"
  }
}

resource "aws_security_group" "ecs_api" {
  name        = "${local.name_prefix}-ecs-api"
  description = "API ECS task ingress from ALB"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-ecs-api"
  }
}

resource "aws_security_group" "ecs_worker" {
  name        = "${local.name_prefix}-ecs-worker"
  description = "Worker ECS task outbound only"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-ecs-worker"
  }
}

resource "aws_vpc_security_group_ingress_rule" "frontend_from_alb" {
  security_group_id            = aws_security_group.ecs_frontend.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3000
  ip_protocol                  = "tcp"
  to_port                      = 3000

  tags = {
    Name    = "${local.name_prefix}-frontend-from-alb"
    Service = "frontend"
  }
}

resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.ecs_api.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3001
  ip_protocol                  = "tcp"
  to_port                      = 3001

  tags = {
    Name    = "${local.name_prefix}-api-from-alb"
    Service = "api"
  }
}

resource "aws_vpc_security_group_egress_rule" "ecs_frontend_all" {
  security_group_id = aws_security_group.ecs_frontend.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name    = "${local.name_prefix}-ecs-frontend-all-egress"
    Service = "frontend"
  }
}

resource "aws_vpc_security_group_egress_rule" "ecs_api_all" {
  security_group_id = aws_security_group.ecs_api.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name    = "${local.name_prefix}-ecs-api-all-egress"
    Service = "api"
  }
}

resource "aws_vpc_security_group_egress_rule" "ecs_worker_all" {
  security_group_id = aws_security_group.ecs_worker.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name    = "${local.name_prefix}-ecs-worker-all-egress"
    Service = "worker"
  }
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds"
  description = "PostgreSQL access from API and worker ECS tasks"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-rds"
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_api" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.ecs_api.id
  from_port                    = 5432
  ip_protocol                  = "tcp"
  to_port                      = 5432

  tags = {
    Name    = "${local.name_prefix}-rds-from-api"
    Service = "api"
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_worker" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.ecs_worker.id
  from_port                    = 5432
  ip_protocol                  = "tcp"
  to_port                      = 5432

  tags = {
    Name    = "${local.name_prefix}-rds-from-worker"
    Service = "worker"
  }
}

resource "aws_vpc_security_group_egress_rule" "rds_all" {
  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name = "${local.name_prefix}-rds-all-egress"
  }
}

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis"
  description = "Valkey Redis-protocol access from API and worker ECS tasks"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_api" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.ecs_api.id
  from_port                    = 6379
  ip_protocol                  = "tcp"
  to_port                      = 6379

  tags = {
    Name    = "${local.name_prefix}-redis-from-api"
    Service = "api"
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_worker" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.ecs_worker.id
  from_port                    = 6379
  ip_protocol                  = "tcp"
  to_port                      = 6379

  tags = {
    Name    = "${local.name_prefix}-redis-from-worker"
    Service = "worker"
  }
}

resource "aws_vpc_security_group_egress_rule" "redis_all" {
  security_group_id = aws_security_group.redis.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name = "${local.name_prefix}-redis-all-egress"
  }
}
