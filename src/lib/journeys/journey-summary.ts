export type JourneySummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  origin: {
    slug: string;
    name: string;
  };
  destination: {
    slug: string;
    name: string;
  };
  estimatedDuration: {
    minMinutes: number;
    maxMinutes: number;
  };
  estimatedFare: {
    minCentavos: number;
    maxCentavos: number;
    currency: "PHP";
  };
  transferCount: number;
  verificationStatus: "verified";
  lastVerifiedAt: string;
};
