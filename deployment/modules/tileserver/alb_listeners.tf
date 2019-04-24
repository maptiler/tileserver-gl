resource "aws_alb_listener" "this_alb_listener" {
  depends_on = ["aws_autoscaling_group.autoscalinggroup-this"]
  load_balancer_arn = "${data.terraform_remote_state.mono_alb.this_alb_arn}"
  port = 80
  protocol = "HTTP"
  default_action {
    target_group_arn = "${aws_alb_target_group.target_group_this.arn}"
    type = "forward"
  }
  lifecycle {
    create_before_destroy = true
  }
}