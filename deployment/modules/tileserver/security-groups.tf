resource "aws_security_group" "this" {
  name_prefix = "maps-sg-"
  description = "Security group for maps instances that allows web traffic inside the VPC"
  vpc_id = "${data.terraform_remote_state.mono_vpc.vpc_id[0]}"
  tags {
    Name = "sg-maps"
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "this_rule_ingress_ssh" {
  description = "Ingress ssh rule for deployed instance}"
  security_group_id = "${aws_security_group.this.id}"
  type = "ingress"
  from_port = 22
  to_port = 22
  protocol = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "this_rule_ingress_traffic" {
  description = "Ingress rule for deployed instance maps"
  security_group_id = "${aws_security_group.this.id}"
  type = "ingress"
  from_port = 80
  to_port = 80
  protocol = "tcp"
  source_security_group_id = "${data.terraform_remote_state.mono_alb.this_alb_sg}"
}

resource "aws_security_group_rule" "this_rule_ingress_healthcheck" {
  description = "Egress rule for deployed instance maps"
  security_group_id = "${aws_security_group.this.id}"
  type = "ingress"
  from_port = 81
  to_port = 81
  protocol = "tcp"
  source_security_group_id = "${data.terraform_remote_state.mono_alb.this_alb_sg}"
}

resource "aws_security_group_rule" "this_rules_egress_traffic" {
  description = "Egress rule for deployed instance traffic"
  security_group_id = "${aws_security_group.this.id}"
  type = "egress"
  from_port = 0
  to_port = 0
  protocol = "-1"
  cidr_blocks = ["0.0.0.0/0"]
}

