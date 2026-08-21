resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.api_autoscaling.max_capacity
  min_capacity       = var.api_autoscaling.min_capacity
  resource_id        = "service/${aws_ecs_cluster.app.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name_prefix}-api-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.api_autoscaling.cpu_target_percent
    scale_out_cooldown = var.api_autoscaling.scale_out_cooldown_seconds
    scale_in_cooldown  = var.api_autoscaling.scale_in_cooldown_seconds

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
