variable "instance_type" {
  description = "Type of instances to be created"
  default     = "t2.micro"
}

variable "region" {
  type        = "string"
  description = "Which Region to deploy to"
  default     = "eu-central-1"
}

variable "environment" {
  type        = "string"
  description = "Environment name"
  default     = "dev"
}

variable "version" {
  type        = "string"
  description = "Build version"
}

variable "mono_region" {
  type        = "string"
  description = "fra/yyz"
}

variable "mono_vpc_remote_state" {
  type = "string"
  description = "Mono VPC remote state key"
}

variable "state_bucket" {
  type = "string"
  description = "Name of bucket containing remote state"
}

variable "mono_efs_remote_state" {
  type = "string"
  description = "Mono EFS remote state key"
}

variable "mono_keypair_remote_state" {
  type = "string"
  description = "Mono keypair remote state key"
}

variable "mono_alb_remote_state" {
  type = "string"
  description = "Remote state for mono_alb"
}

variable "repo_version" {
  type = "string"
  description = "Version of repo to fetch and setup from S3"
}