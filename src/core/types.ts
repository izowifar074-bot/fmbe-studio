import type { V3, Mat } from "./math.js";
export type Diagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  partId?: string;
  line?: number;
  detail?: unknown;
};
export type Parameter = {
  name: string;
  label: string;
  value: number;
  default: number;
  min: number;
  max: number;
  step: number;
};
export type Part = {
  id: string;
  name: string;
  kind: string;
  size: V3;
  matrix: Mat;
  material: string;
  item: string;
  color: string;
  motionGroup: string;
  sourceLine: number;
  group: string;
  meta?: Record<string, any>;
};
export type Design = {
  parts: Part[];
  parameters: Parameter[];
  diagnostics: Diagnostic[];
  constraints: any[];
  source: string;
  budget: number;
};
export type Project = {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  profile: string;
  source: string;
  params: Record<string, number>;
  overrides: Record<
    string,
    {
      size?: V3;
      position?: V3;
      rotation?: V3;
      material?: string;
      hidden?: boolean;
    }
  >;
  budget: number;
  camera: CameraSettings;
  createdAt: string;
  updatedAt: string;
  gun?: {mode:'firearm';reference?:'AK47';reload:boolean;namespace:string;baselineHash:string};
};
export type CameraSettings = {
  mode:
    | "editor"
    | "first_person"
    | "third_person"
    | "third_person_front"
    | "free";
  position: V3;
  rotation: [number, number];
  fov: number;
  aspect?: number;
  resolved?: boolean;
};
export type ResourcePack = {
  version: string;
  commit: string;
  animations: Record<string, any>;
  controllers: Record<string, any>;
  fox: any;
  foxEntity: any;
  player?: any;
  [key: string]: any;
};
export type RecipeResult = {
  partId: string;
  entityId: string;
  commands: string[];
  targetMatrix: Mat;
  targetSize: V3;
  anchor: V3;
  residual: number;
  status: "simulated" | "unsupported";
  message?: string;
};
export type Compilation = {
  design: Design;
  recipes: RecipeResult[];
  init: string[];
  tick: string[];
  cleanup: string[];
  diagnostics: Diagnostic[];
  entityCount: number;
  budget: number;
  withinBudget: boolean;
  exportable: boolean;
  verifiedInGame: false;
  profile: string;
  hash: string;
  gun?: any;
};
export const MATERIALS: Record<
  string,
  { item: string; color: string; label: string }
> = {
  stone: { item: "minecraft:stone", color: "#8d9296", label: "石头" },
  iron: { item: "minecraft:iron_block", color: "#cbd5da", label: "铁块" },
  dark: {
    item: "minecraft:black_concrete",
    color: "#24262b",
    label: "黑色混凝土",
  },
  black:{item:'minecraft:black_concrete',color:'#24262b',label:'黑色混凝土'},
  gray:{item:'minecraft:gray_concrete',color:'#555961',label:'灰色混凝土'},
  acacia:{item:'minecraft:acacia_planks',color:'#b46038',label:'金合欢木板'},
  white: {
    item: "minecraft:white_concrete",
    color: "#d5d9dc",
    label: "白色混凝土",
  },
  copper: { item: "minecraft:copper_block", color: "#c97751", label: "铜块" },
  wood: { item: "minecraft:oak_planks", color: "#af8852", label: "橡木板" },
  red: {
    item: "minecraft:red_concrete",
    color: "#b7483d",
    label: "红色混凝土",
  },
  blue: {
    item: "minecraft:blue_concrete",
    color: "#476aba",
    label: "蓝色混凝土",
  },
  cyan: {
    item: "minecraft:cyan_concrete",
    color: "#239b9c",
    label: "青色混凝土",
  },
  gold: { item: "minecraft:gold_block", color: "#dbb94e", label: "金块" },
};
