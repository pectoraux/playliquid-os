"use client";

import { create } from "zustand";

export type PanelId =
  | "architecture"
  | "registry"
  | "worlds"
  | "build"
  | "runtime"
  | "console";

interface PlayliquidState {
  panel: PanelId;
  setPanel: (p: PanelId) => void;

  // selections
  selectedPackageId: string | null;
  selectedProjectId: string | null;
  selectedBuildId: string | null;
  selectedNodeId: string | null;

  selectPackage: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  selectBuild: (id: string | null) => void;
  selectNode: (id: string | null) => void;

  // kernel
  autoTick: boolean;
  setAutoTick: (v: boolean) => void;
}

export const usePlayliquid = create<PlayliquidState>((set) => ({
  panel: "architecture",
  setPanel: (panel) => set({ panel }),

  selectedPackageId: null,
  selectedProjectId: null,
  selectedBuildId: null,
  selectedNodeId: null,

  selectPackage: (selectedPackageId) => set({ selectedPackageId }),
  selectProject: (selectedProjectId) => set({ selectedProjectId }),
  selectBuild: (selectedBuildId) => set({ selectedBuildId }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),

  autoTick: false,
  setAutoTick: (autoTick) => set({ autoTick }),
}));
