# openproduct's own database: one Supabase project per environment,
# `openproduct-{env}`, in the openproduct Supabase organization.
#
# Taken from orun-cloud ffb71be69 (apps/openproduct/infra/supabase) as it is,
# with the changes this repository forces (openproduct-standalone design §11),
# made the way lumen's supabase stack makes them:
#   - state is on the platform (http backend), not in S3;
#   - the credentials leave through outputs that the composition publishes to
#     the environment's workspace secrets (component.yaml secretOutputs), not
#     through Secrets Manager. So there is no AWS provider at all;
#   - the provider is pinned below 1.6 (see required_providers).

terraform {
  required_version = ">= 1.15.0"

  # State lives on the platform: the runner exports TF_HTTP_* per job
  # (address …/state/tfstate/{component}/{env}, the run token as password), so
  # this block stays empty. No bucket, no role, no workspaces: the environment
  # is in the address.
  backend "http" {}

  required_providers {
    supabase = {
      source = "supabase/supabase"
      # Below 1.6: from 1.6.0 the provider reads /billing/addons on every
      # project create and read, and Supabase does not serve billing
      # endpoints to OAuth tokens, which is the credential the platform
      # brokers (lumen pins the same).
      version = "~> 1.5.1"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# --- Providers ---

# Authenticates via the SUPABASE_ACCESS_TOKEN env var (provider-native): a
# short-lived Management API token minted per run from the openproduct
# Supabase connection.
provider "supabase" {}

# --- Variables (standard Orun parameters) ---

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
  default = "openproduct-supabase"
}

variable "stackName" {
  type    = string
  default = "openproduct-supabase"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

# Supabase target identity. supabaseRegion comes from the component's
# parameters; supabaseOrgId arrives as TF_VAR_supabaseOrgId from the
# SUPABASE_ORG_ID secret (the connection's org-id fact). Both are required,
# with no default, so a missing value fails the plan instead of pointing at
# the wrong organization or region.
variable "supabaseOrgId" {
  type = string
}

variable "supabaseRegion" {
  type = string
}

# --- Locals ---

locals {
  supabase_org_id = var.supabaseOrgId
  supabase_region = var.supabaseRegion
  project_name    = "openproduct-${var.environment}"
}

# --- Generate database password ---

resource "random_password" "db_password" {
  length  = 32
  special = true
  # Avoid characters that cause issues in connection strings
  override_special = "!#$%&*()-_=+[]{}|:,.<>?"
}

# --- Supabase project ---

resource "supabase_project" "this" {
  organization_id   = local.supabase_org_id
  name              = local.project_name
  database_password = random_password.db_password.result
  region            = local.supabase_region
}

# --- Outputs ---
#
# The credentials leave this module only through the composition's
# secretOutputs step, which publishes project_ref, database_password and
# connection_uri as SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD and
# SUPABASE_DB_URL on this environment's rung. Hyperdrive and db-migrate read
# the same keys back as secretEnv references.

output "project_ref" {
  description = "Supabase project reference ID"
  value       = supabase_project.this.id
}

output "project_name" {
  description = "Supabase project name"
  value       = supabase_project.this.name
}

output "project_url" {
  description = "Supabase project URL"
  value       = "https://${supabase_project.this.id}.supabase.co"
}

output "database_password" {
  description = "Generated database password (sensitive; published as SUPABASE_DB_PASSWORD)"
  value       = random_password.db_password.result
  sensitive   = true
}

output "connection_uri" {
  description = "Direct Postgres connection URI (sensitive; published as SUPABASE_DB_URL)"
  value       = "postgresql://postgres:${random_password.db_password.result}@db.${supabase_project.this.id}.supabase.co:5432/postgres"
  sensitive   = true
}
