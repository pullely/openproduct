# openproduct's media bucket, one per environment (stage, prod).
#
# Taken from the monorepo as it is, with the changes this repository forces
# (openproduct-standalone design §4, §11), as infra/hyperdrive made them:
# state is on the platform (http backend), the provider reads
# CLOUDFLARE_API_TOKEN from the environment, and the Secrets Manager wiring
# manifest is gone. The gateway binds the bucket by its name, which is
# committed in its wrangler.jsonc, so nothing reads a published wiring.

terraform {
  required_version = ">= 1.15.0"

  # State lives on the platform: the runner exports TF_HTTP_* per job.
  backend "http" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.52"
    }
  }
}

# --- Providers ---

# Authenticates via the CLOUDFLARE_API_TOKEN env var (provider-native): an
# r2-data token brokered from the openproduct Cloudflare connection.
provider "cloudflare" {}

# --- Variables (standard Orun parameters) ---

variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare account ID (from CLOUDFLARE_ACCOUNT_ID env var)"
}

variable "orgName" {
  type    = string
  default = "sourceplane"
}

variable "owner" {
  type    = string
  default = "pullely"
}

variable "repo" {
  type    = string
  default = "openproduct"
}

variable "namespace" {
  type    = string
  default = "sourceplane"
}

variable "namespacePrefix" {
  type    = string
  default = ""
}

variable "lane" {
  type    = string
  default = "verify"
}

variable "environment" {
  type    = string
  default = "stage"
}

variable "component" {
  type    = string
  default = "openproduct-media"
}

variable "stackName" {
  type    = string
  default = "openproduct-media"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

variable "r2_location_hint" {
  type        = string
  default     = "ENAM"
  description = "R2 bucket location hint (one of WNAM, ENAM, WEUR, EEUR, APAC, OC). Set once at create; immutable after."
}

# --- The media bucket (openproduct-worldclass MD1) ---
#
# ONE BUCKET PER ENVIRONMENT, OPENPRODUCT'S OWN. Holds the bytes behind
# `openproduct.product_media` — Postgres keeps only the index rows (1820), and
# every row's `storage_ref` is a content hash that names an object here:
#
#   media/{sha256}.{png|jpg|webp}        the original, as uploaded
#   media/{sha256}/w{400|800|1600}.webp  derivatives, generated at upload
#
# Content-addressed, so every object is immutable and the gateway serves it
# with a year-long immutable cache header; and so two makers uploading the
# same file share one object — which is why deleting a row never deletes an
# object (that is a retention question, openproduct-scale OS3).
#
# Bound to `openproduct-gateway` as `MEDIA` in its wrangler.jsonc, by name,
# in stage and prod only. The gateway's binding allowlist test names this
# bucket as the ONE data resource the worker may hold (MD-4, OPX-4).

locals {
  media_bucket_name = "openproduct-media-${var.environment}"
}

resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  name       = local.media_bucket_name
  location   = upper(var.r2_location_hint)
}

# --- Outputs (non-secret) ---

output "openproduct_media_bucket_name" {
  description = "Cloudflare R2 bucket name bound to openproduct-gateway as MEDIA"
  value       = cloudflare_r2_bucket.media.name
}
