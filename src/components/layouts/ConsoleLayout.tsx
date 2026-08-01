import React from "react";

interface ConsoleLayoutProps {
  ambientBg: React.ReactNode;
  header: React.ReactNode;
  mainContent: React.ReactNode;
  launchingOverlay: React.ReactNode;
  modals: React.ReactNode;
}

export const ConsoleLayout: React.FC<ConsoleLayoutProps> = ({
  ambientBg,
  header,
  mainContent,
  launchingOverlay,
  modals,
}) => {
  return (
    <div className="app-root">
      {ambientBg}
      <div className="console-container">
        {header}
        <main className="console-content">{mainContent}</main>
      </div>
      {launchingOverlay}
      {modals}
    </div>
  );
};
