/** The artifact's page in the web app, at one version if given. */
export function artifactPageUrl(baseUrl: string, artifactId: string, versionNo?: number): string {
  const url = `${baseUrl}/artifacts/${artifactId}`;
  return versionNo === undefined ? url : `${url}?v=${versionNo}`;
}
