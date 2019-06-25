resource "aws_iam_role" "role" {
  name               = "maps-role-${var.environment}-${var.region}"
  assume_role_policy = "${file("policies/assume-role-policy.json")}"
}

resource "aws_iam_instance_profile" "profile" {
  depends_on = ["aws_iam_role.role"]
  name       = "maps-profile-${var.environment}-${var.region}"
  role       = "${aws_iam_role.role.name}"
}

data "template_file" "policies_json" {
  template = "${file("policies/policies.json")}"
  vars {
    environment = "${var.environment}"
    region = "${var.region}"
  }
}