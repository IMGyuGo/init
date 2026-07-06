resource "aws_ecs_cluster" "app" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = {
    Name = local.name_prefix
  }
}

resource "aws_ecs_cluster_capacity_providers" "app" {
  cluster_name       = aws_ecs_cluster.app.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

resource "aws_ecs_task_definition" "service" {
  for_each = local.services

  family                   = "${local.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(each.value.cpu)
  memory                   = tostring(each.value.memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task[each.key].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  tags = {
    Name    = "${local.name_prefix}-${each.key}"
    Service = each.key
  }

  container_definitions = jsonencode([
    {
      name      = each.value.container_name
      image     = "${aws_ecr_repository.service[each.key].repository_url}:${var.image_tag}"
      essential = true

      portMappings = each.value.port == null ? [] : [
        {
          containerPort = each.value.port
          hostPort      = each.value.port
          protocol      = "tcp"
        }
      ]

      environment = [
        for key, value in local.static_environment[each.key] : {
          name  = key
          value = value
        }
      ]

      secrets = [
        for key in local.secret_keys[each.key] : {
          name      = key
          valueFrom = "${aws_secretsmanager_secret.runtime[each.key].arn}:${key}::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs[each.key].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = each.key
        }
      }
    }
  ])
}

resource "aws_ecs_service" "service" {
  for_each = local.services

  name            = "${local.name_prefix}-${each.key}"
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = var.desired_counts[each.key]

  enable_execute_command             = true
  health_check_grace_period_seconds  = each.key == "worker" ? null : 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_ecs_managed_tags            = true
  propagate_tags                     = "SERVICE"

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider_by_service[each.key]
    weight            = 1
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = values(aws_subnet.private_app)[*].id
    assign_public_ip = false
    security_groups = [
      each.key == "frontend" ? aws_security_group.ecs_frontend.id :
      each.key == "api" ? aws_security_group.ecs_api.id :
      aws_security_group.ecs_worker.id
    ]
  }

  dynamic "load_balancer" {
    for_each = each.key == "worker" ? [] : [each.key]

    content {
      target_group_arn = load_balancer.value == "frontend" ? aws_lb_target_group.frontend.arn : aws_lb_target_group.api.arn
      container_name   = local.services[load_balancer.value].container_name
      container_port   = local.services[load_balancer.value].port
    }
  }

  depends_on = [
    aws_lb_listener.http,
    aws_ecs_cluster_capacity_providers.app
  ]

  # App deploys register task definition revisions outside Terraform; infra applies
  # should not roll ECS services back to the bootstrap image tag.
  lifecycle {
    ignore_changes = [task_definition]
  }

  tags = {
    Name    = "${local.name_prefix}-${each.key}"
    Service = each.key
  }
}
