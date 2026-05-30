'use client';

import React from 'react';
import TopBar from './TopBar';
import SiteFooter from './SiteFooter';

/**
 * BlogShell — thin 'use client' wrapper that adds TopBar + SiteFooter
 * around server-rendered blog page content (children).
 */
const BlogShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      <TopBar forceOpaque />
      <div style={{ paddingTop: 65 }}>
        {children}
      </div>
      <SiteFooter />
    </>
  );
};

export default BlogShell;
