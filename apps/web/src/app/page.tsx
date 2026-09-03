'use client';

import React from 'react';
import DashboardLayout from './(dashboard)/layout';
import DashboardHomePage from './(dashboard)/page';

export default function HomePage() {
  return (
    <DashboardLayout>
      <DashboardHomePage />
    </DashboardLayout>
  );
}
