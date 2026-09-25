export type AppRole='farmer'|'buyer'; export type UserRole=AppRole; export type Buyer={id:string;name:string;location:string;verified:boolean}; export type Crop={id:string;name:string;category:string}; export type AppNotification={id:string;type:'ORDER'|'PRICE'|'PAYMENT'|'TRANSPORT'|'SYSTEM';title:string;message:string;read:boolean;createdAt:string}; export type QualityResult={qualityGrade:'A'|'B'|'C';qualityScore:number;confidence:number;estimatedDefects:string[];notes:string[];recommendedPriceMultiplier:number};

// --- AI Scanner contract (mirrors backend/src/types/scan.ts) ---
export type ScanIssueType='disease'|'pest'|'nutrient_deficiency'|'quality_defect';
export type ScanSeverity='low'|'medium'|'high';
export type ScanSource='gemini'|'mock';
export type ScanIssue={type:ScanIssueType;name:string;severity:ScanSeverity;confidence:number;description:string;treatment:string};
export type ScanResult={
  isCropPhoto:boolean;
  notCropReason?:string;
  crop:{name:string;scientificName?:string;confidence:number};
  quality:{grade:'A'|'B'|'C';score:number;confidence:number};
  issues:ScanIssue[];
  observations:string[];
  recommendedPriceMultiplier?:number;
  scannedAt:string;
  model:string;
};
