// Contractul comun al scannerelor (versiunea web cu mesh 3D și versiunea nativă cu expo-camera).

export type ScanShots = {
  front: string;
  left?: string; // profil: utilizatorul și-a întors capul spre STÂNGA lui
  right?: string;
  down?: string; // capul înclinat în jos (scalp / linia părului), doar în modul 3D
};

export type ScanMeta = {
  mode: "3d" | "basic" | "native";
  poses: number; // câte unghiuri s-au capturat
  faceMean?: number; // luminozitatea medie pe față, 0–255, la poza din față
  asymmetry?: number; // diferența de lumină stânga/dreapta, 0–1
  forced: boolean; // true dacă utilizatorul a declanșat manual cel puțin o poză
};

export type FaceScannerProps = {
  onComplete: (shots: ScanShots, meta: ScanMeta) => void;
  onCancel: () => void;
};
