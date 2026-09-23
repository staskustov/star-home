import QRCode from "qrcode";

export async function passQr(code: string): Promise<string> {
  return QRCode.toString(code, {
    type: "svg",
    margin: 1,
    width: 128,
    color: { dark: "#1A1A1A", light: "#FFFFFF" },
  });
}
