import React, { useContext, useEffect } from "react";
import PortalContext from "./portal-context";

const Portal = ({ children, name }: { children: React.ReactNode; name: string }) => {
  const { addComponent, removeComponent } = useContext(PortalContext);

  useEffect(() => {
    addComponent({ name, component: children });
    return () => removeComponent(name);
  }, [children, name]);

  return null;
};

export default Portal;
