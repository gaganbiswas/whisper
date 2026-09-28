import * as React from "react";

export interface PortalElement {
  name: string;
  component: React.ReactNode;
}

const PortalContext = React.createContext({
  addComponent: (_element: PortalElement) => {},
  removeComponent: (_name: string) => {},
});

export default PortalContext;
