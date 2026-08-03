export type GeolocationStatus =
  | "idle"
  | "requesting"
  | "success"
  | "permission-denied"
  | "unsupported"
  | "position-unavailable"
  | "timeout";

export const geolocationStatusMessages = {
  idle: "Show your position on the map without saving it.",
  requesting: "Requesting your current location…",
  success: "Current location displayed. Your precise position is not saved.",
  "permission-denied":
    "Location permission was denied. You can continue selecting locations manually.",
  unsupported:
    "This browser does not support location access. Select a location manually.",
  "position-unavailable":
    "Your position is currently unavailable. Check your device location settings and try again.",
  timeout:
    "Location lookup timed out. Try again or select a location manually.",
} satisfies Record<GeolocationStatus, string>;

export function getGeolocationFailureStatus(
  errorCode: number,
): Extract<
  GeolocationStatus,
  "permission-denied" | "position-unavailable" | "timeout"
> {
  if (errorCode === 1) {
    return "permission-denied";
  }

  if (errorCode === 3) {
    return "timeout";
  }

  return "position-unavailable";
}

export function isGeolocationFailure(status: GeolocationStatus) {
  return (
    status === "permission-denied" ||
    status === "unsupported" ||
    status === "position-unavailable" ||
    status === "timeout"
  );
}
