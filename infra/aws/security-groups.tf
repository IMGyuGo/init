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

resource "aws_vpc_security_group_ingress_rule" "alb_http_ngrinder" {
  count = var.enable_ngrinder ? 1 : 0

  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.ngrinder[0].id
  from_port                    = 80
  ip_protocol                  = "tcp"
  to_port                      = 80

  tags = {
    Name   = "${local.name_prefix}-alb-http-ngrinder"
    Source = "ngrinder"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_ngrinder_public_ip" {
  count = var.enable_ngrinder ? 1 : 0

  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "${aws_instance.ngrinder[0].public_ip}/32"
  from_port         = 80
  ip_protocol       = "tcp"
  to_port           = 80

  tags = {
    Name   = "${local.name_prefix}-alb-http-ngrinder-public-ip"
    Source = "ngrinder-public-ip"
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

resource "aws_security_group" "ngrinder" {
  count = var.enable_ngrinder ? 1 : 0

  name        = "${local.name_prefix}-ngrinder"
  description = "nGrinder controller UI access from operator CIDRs and outbound load tests"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name    = "${local.name_prefix}-ngrinder"
    Service = "ngrinder"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ngrinder_controller_from_operator" {
  for_each = var.enable_ngrinder ? toset(var.ngrinder_allowed_cidr_blocks) : toset([])

  security_group_id = aws_security_group.ngrinder[0].id
  cidr_ipv4         = each.value
  from_port         = var.ngrinder_controller_port
  ip_protocol       = "tcp"
  to_port           = var.ngrinder_controller_port

  tags = {
    Name   = "${local.name_prefix}-ngrinder-controller"
    Source = each.value
  }
}

resource "aws_vpc_security_group_egress_rule" "ngrinder_all" {
  count = var.enable_ngrinder ? 1 : 0

  security_group_id = aws_security_group.ngrinder[0].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name    = "${local.name_prefix}-ngrinder-all-egress"
    Service = "ngrinder"
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
