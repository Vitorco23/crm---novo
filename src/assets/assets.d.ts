declare module "*.asset.json" {
  const content: {
    url: string;
    version: number;
    asset_id: string;
    project_id: string;
    original_filename: string;
    size: number;
    content_type: string;
    created_at: string;
  };
  export default content;
}
