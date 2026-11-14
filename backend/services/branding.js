import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import { pool, transaction } from "../database/pool.js";
function image(value) {
  const match =
    /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value || "",
    );
  if (!match)
    throw Object.assign(new Error("Logo must be a PNG or JPEG image"), {
      status: 400,
    });
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 102400)
    throw Object.assign(new Error("Logo must be at most 100 KB"), {
      status: 400,
    });
  const actualPng = buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const actualJpeg =
    buffer.length >= 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255;
  if (match[1] === "image/png" ? !actualPng : !actualJpeg)
    throw Object.assign(
      new Error("Logo content does not match its PNG/JPEG type"),
      { status: 400 },
    );
  const doc = new PDFDocument({ autoFirstPage: false });
  try {
    const asset = doc.openImage(buffer);
    if (
      asset.width > 2048 ||
      asset.height > 2048 ||
      asset.width < 1 ||
      asset.height < 1
    )
      throw new Error("Logo dimensions must be at most 2048 × 2048");
  } catch (error) {
    throw Object.assign(
      new Error(
        error.message.startsWith("Logo")
          ? error.message
          : "Unable to read logo image",
      ),
      { status: 400 },
    );
  } finally {
    doc.destroy();
  }
  return {
    buffer,
    type: match[1],
    hash: createHash("sha256").update(buffer).digest("hex"),
  };
}
export async function studioSettings() {
  const row = (
    await pool.query(
      "SELECT s.*,a.media_type,a.image_data FROM studio_settings s LEFT JOIN studio_brand_assets a ON a.id=s.logo_asset_id WHERE s.id=1",
    )
  ).rows[0];
  const { image_data, media_type, ...settings } = row;
  return {
    ...settings,
    logo_data_url: image_data
      ? "data:" + media_type + ";base64," + image_data.toString("base64")
      : null,
  };
}
export async function saveStudioSettings(data, user) {
  return transaction(async (client) => {
    const before = user
      ? (
          await client.query(
            "SELECT name,phone,email,address,tagline,logo_asset_id,signatory_name,signatory_title,receipt_footer FROM studio_settings WHERE id=1 FOR UPDATE",
          )
        ).rows[0]
      : null;
    let assetId;
    if (data.logo_data_url === null || data.logo_data_url === "")
      assetId = null;
    else if (data.logo_data_url !== undefined) {
      const asset = image(data.logo_data_url);
      assetId = (
        await client.query(
          "INSERT INTO studio_brand_assets(sha256,media_type,image_data) VALUES($1,$2,$3) ON CONFLICT(sha256) DO UPDATE SET sha256=EXCLUDED.sha256 RETURNING id",
          [asset.hash, asset.type, asset.buffer],
        )
      ).rows[0].id;
    }
    await client.query(
      "UPDATE studio_settings SET name=$1,phone=$2,email=$3,address=$4,tagline=COALESCE($5,tagline),signatory_name=COALESCE($6,signatory_name),signatory_title=COALESCE($7,signatory_title),receipt_footer=COALESCE($8,receipt_footer)" +
        (assetId !== undefined ? ",logo_asset_id=$9" : "") +
        " WHERE id=1",
      [
        data.name,
        data.phone,
        data.email,
        data.address,
        data.tagline ?? null,
        data.signatory_name ?? null,
        data.signatory_title ?? null,
        data.receipt_footer ?? null,
        ...(assetId !== undefined ? [assetId] : []),
      ],
    );
    if (user) {
      const after = (
        await client.query(
          "SELECT name,phone,email,address,tagline,logo_asset_id,signatory_name,signatory_title,receipt_footer FROM studio_settings WHERE id=1",
        )
      ).rows[0];
      await client.query(
        "INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'update_settings','studio_settings',1,$2)",
        [user.id, { before, after }],
      );
    }
  });
}
