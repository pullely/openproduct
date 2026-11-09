# The D1 probe database (openproduct-standalone OPN, task OPN-2, milestone
# OPN1 "D1 proven on one slice").
#
# ONE throwaway D1 database, in STAGE ONLY, that the `openproduct-d1-probe`
# Worker (infra/d1-probe) binds as `DB` and loads with the slice's 5,000-
# listing corpus, so the slice's catalogue and search methods can be measured
# on REMOTE D1 from inside Cloudflare, and the limits local workerd does not
# enforce (32 arguments per function, 2 MB per value, 50 MB per result) can be
# shown to be enforced. It holds nothing but generated data; it is not the
# product's database and nothing else binds it.
#
# State lives on the platform (SB1): the runner exports TF_HTTP_* per job, so
# the backend block stays empty — no S3 bucket, no AWS role, no workspaces.
# The pattern is cirrus's proven `infra/terraform/cloudflare-d1` (pullely/
# ackstack), with two additions the v5 provider makes possible: the location
# hint and the read-replication mode.

terraform {
  required_version = ">= 1.15.0"

  backend "http" {}

  required_providers {
    # v5, not cirrus's ~> 4.30: `primary_location_hint` and `read_replication`
    # exist on `cloudflare_d1_database` only in v5 (checked against the
    # provider schema, 5.28.1).
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3"
    }
  }
}

# --- Providers ---

# Authenticates via the CLOUDFLARE_API_TOKEN env var (provider-native): the
# token is an orun-managed secret (d1-edit) resolved into the job env at run
# time, so it never transits Terraform variables.
provider "cloudflare" {}

# --- Variables (standard Orun parameters; the composition exports every
#     component parameter as TF_VAR_<name>) ---

variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare account ID (from the CLOUDFLARE_ACCOUNT_ID secret, as TF_VAR_cloudflare_account_id)"
}

variable "orgName" {
  type    = string
  default = "sourceplane"
}

variable "owner" {
  type    = string
  default = "sourceplane"
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

  # The probe is stage-only. The component subscribes to stage alone; this
  # makes a plan in any other environment fail rather than create a second
  # probe database.
  validation {
    condition     = var.environment == "stage"
    error_message = "cloudflare-d1-probe is stage-only: the probe database must not exist in any other environment."
  }
}

variable "component" {
  type    = string
  default = "cloudflare-d1-probe"
}

variable "stackName" {
  type    = string
  default = "cloudflare-d1-probe"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

variable "primaryLocationHint" {
  type        = string
  default     = "apac"
  description = "D1 primary location hint. apac: beside the product's Supabase (ap-southeast-1) and core's placement hint, so the probe measures the region the product would run in."

  validation {
    condition     = contains(["wnam", "enam", "weur", "eeur", "apac", "oc"], var.primaryLocationHint)
    error_message = "primaryLocationHint must be one of D1's location hints: wnam, enam, weur, eeur, apac, oc."
  }
}

variable "readReplicationMode" {
  type        = string
  default     = "auto"
  description = <<-EOT
    D1 read replication. "auto" so the probe's Sessions API reads can reach a
    replica (and report served_by_region / served_by_primary and lag), while
    its plain-binding reads are, by D1's rules, always the primary — the
    "without replication" baseline, from the same database.
  EOT

  validation {
    condition     = contains(["auto", "disabled"], var.readReplicationMode)
    error_message = "readReplicationMode must be auto or disabled."
  }
}

# --- The probe database ---

locals {
  # Fixed, not namespaced: the brief names it, D1 names are unique per
  # account, and the Worker resolves the database by ID through the wiring
  # secret anyway.
  database_name = "openproduct-probe-${var.environment}"
}

resource "cloudflare_d1_database" "probe" {
  account_id            = var.cloudflare_account_id
  name                  = local.database_name
  primary_location_hint = var.primaryLocationHint

  read_replication = {
    mode = var.readReplicationMode
  }

  lifecycle {
    # The location hint is honoured at creation only; a later change must not
    # read as a reason to replace a database with data in it.
    ignore_changes = [primary_location_hint]
  }
}

# --- Wiring manifest (BF5, via orun secrets) ---
#
# Published by the composition's apply step as the WIRING_CLOUDFLARE_D1_PROBE
# secret on the project/stage rung (secretOutputs in component.yaml); the
# probe Worker's deploy reads it back as WIRING_CLOUDFLARE_D1_PROBE_STAGE and
# renders the committed @@wiring(cloudflare-d1-probe/stage:d1_database_id)@@
# token from it (BF6). Same shape as cirrus's cloudflare-d1 wiring.

output "wiring" {
  description = "Wiring document for downstream deploy-time binding resolution (pushed to orun secrets)"
  value = jsonencode({
    d1_database_id   = cloudflare_d1_database.probe.uuid
    d1_database_name = cloudflare_d1_database.probe.name
  })
}

# --- Outputs (non-secret) ---

output "d1_database_id" {
  description = "Cloudflare D1 database ID (the probe Worker's database_id)"
  value       = cloudflare_d1_database.probe.uuid
}

output "d1_database_name" {
  description = "Cloudflare D1 database name"
  value       = cloudflare_d1_database.probe.name
}
