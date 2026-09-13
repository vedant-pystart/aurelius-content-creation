export interface AssetSourceMap { readonly [assetId: string]: string | undefined }
export function sourceForAsset(sources: AssetSourceMap, assetId: string): string | undefined { return sources[assetId]; }
