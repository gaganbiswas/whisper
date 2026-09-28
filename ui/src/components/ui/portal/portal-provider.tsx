import React, { useState } from "react";
import PortalContext, { type PortalElement } from "./portal-context";

const PortalProvider = ({ children }: { children: React.ReactNode }) => {
  const [components, setComponents] = useState<Record<string, React.ReactNode>>(
    {},
  );

  const addComponent = ({ name, component }: PortalElement) => {
    setComponents((prev) => ({ ...prev, [name]: component }));
  };

  const removeComponent = (name: string) => {
    setComponents(({ [name]: _removed, ...rest }) => rest);
  };

  return (
    <PortalContext.Provider value={{ addComponent, removeComponent }}>
      {children}
      {Object.entries(components).map(([name, component]) => (
        <React.Fragment key={name}>{component}</React.Fragment>
      ))}
    </PortalContext.Provider>
  );
};

export default PortalProvider;
