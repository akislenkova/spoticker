-- Rename 'CPU (Graviton)' → 'CPU (ARM)' in the aggregation RPC.
-- Graviton is AWS-specific; the label should be cloud-agnostic (AWS Graviton,
-- Azure Ampere Altra, GCP T2A all map to this row).
CREATE OR REPLACE FUNCTION latest_azure_spot_prices_agg()
RETURNS TABLE(
  gpu_label    text,
  region       text,
  arm_sku_name text,
  retail_price float8
)
LANGUAGE sql
STABLE
AS $$
  WITH latest_ts AS (
    SELECT MAX(fetched_at) AS ts FROM azure_spot_prices
  ),
  labeled AS (
    SELECT
      p.arm_sku_name,
      p.region,
      p.retail_price,
      CASE
        WHEN p.arm_sku_name ILIKE '%H200%'  THEN 'H200'
        WHEN p.arm_sku_name ILIKE '%H100%'  THEN 'H100'
        WHEN p.arm_sku_name ILIKE '%A100%'  THEN 'A100 80GB'
        WHEN p.arm_sku_name ILIKE '%V100%'  THEN 'V100'
        WHEN p.arm_sku_name ILIKE '%L40S%'  THEN 'L40S'
        WHEN p.arm_sku_name ILIKE '%L4%'    THEN 'L4'
        WHEN p.arm_sku_name ILIKE '%A10%'   THEN 'A10G'
        WHEN p.arm_sku_name ILIKE '%T4%'    THEN 'T4'
        WHEN p.arm_sku_name ~* 'Standard_[A-Za-z][0-9]+a[sd]?s_v[45]'  THEN 'CPU (AMD)'
        WHEN p.arm_sku_name ~* 'Standard_[A-Za-z][0-9]+p[ls]?s_v[45]'  THEN 'CPU (ARM)'
        WHEN p.arm_sku_name ~* 'Standard_[A-Za-z][0-9]+d?s_v5'          THEN 'CPU (Intel)'
        ELSE NULL
      END AS gpu_label
    FROM azure_spot_prices p
    CROSS JOIN latest_ts
    WHERE p.fetched_at = latest_ts.ts
      AND p.arm_sku_name IS NOT NULL
  ),
  ranked AS (
    SELECT
      gpu_label,
      region,
      arm_sku_name,
      retail_price,
      ROW_NUMBER() OVER (
        PARTITION BY gpu_label, region
        ORDER BY retail_price ASC
      ) AS rn
    FROM labeled
    WHERE gpu_label IS NOT NULL
  )
  SELECT gpu_label, region, arm_sku_name, retail_price
  FROM ranked
  WHERE rn = 1;
$$;
