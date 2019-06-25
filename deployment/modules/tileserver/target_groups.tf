resource "aws_alb_target_group" "target_group_this" {
  name = "maps"
  port = "80"
  protocol = "HTTP"
  vpc_id = "${data.terraform_remote_state.mono_vpc.vpc_id[0]}"
  slow_start = 200
  deregistration_delay = 120
  stickiness {
    type            = "lb_cookie"
    enabled         = true
    cookie_duration = "300"
  }
  health_check {
    interval            = "60"
    path                = "/health"
    port                = "80"
    healthy_threshold   = "2"
    unhealthy_threshold = "3"
    timeout             = "5"
    protocol            = "HTTP"
    matcher = "200"
  }
}
