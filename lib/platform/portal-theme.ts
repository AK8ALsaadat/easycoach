/** Only a validated six-digit color becomes a CSS value. */
export function portalTheme(color: string | null | undefined) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  const channels=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255)
    .map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
  const luminance=channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
  return {"--ui-primary":color,"--ui-primary-hover":color,"--ui-on-primary":luminance>0.179?"#000000":"#ffffff"};
}
