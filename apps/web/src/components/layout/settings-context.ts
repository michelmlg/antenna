import { createContext, useContext } from "react";

export type SettingsSection = "geral" | "transmissao" | "sistema" | "sobre";

export const SettingsContext = createContext<(section?: SettingsSection) => void>(() => {});

/** Abre o modal de Configurações (opcionalmente numa seção). */
export function useOpenSettings() {
  return useContext(SettingsContext);
}
