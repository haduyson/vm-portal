# Design Guidelines - VM Portal Nội Bộ

## Brand & Identity
- **Name:** VM Portal
- **Language:** Vietnamese (tiếng Việt)
- **Target:** Internal employees - clean, functional, no-frills

## Color Palette
- **Primary:** `#1976D2` (Blue 700) - trust, technology
- **Secondary:** `#424242` (Grey 800) - professional
- **Success:** `#2E7D32` (Green 800) - VM ready
- **Warning:** `#ED6C02` (Orange 700) - provisioning
- **Error:** `#D32F2F` (Red 700) - failed
- **Background:** `#F5F5F5` (Grey 100)
- **Surface:** `#FFFFFF`

## Typography
- **Font:** Inter (system fallback: -apple-system, sans-serif)
- **Headings:** 600 weight
- **Body:** 400 weight, 14px base

## Layout
- **Sidebar:** 240px, collapsible on mobile
- **Content:** max-width 1200px, centered
- **Spacing:** 8px grid system (8, 16, 24, 32, 48)
- **Border radius:** 8px (cards), 4px (inputs/buttons)

## Components (MUI v5)
- AppBar with user menu
- Sidebar navigation (Dashboard, Tạo VM, Danh sách VM)
- Cards for VM status display
- Form controls with Vietnamese labels
- Status chips: Đang tạo (orange), Đang cài đặt (blue), Hoàn tất (green), Lỗi (red)

## Responsive
- Desktop: sidebar + main content
- Tablet (< 960px): collapsible sidebar
- Mobile (< 600px): bottom navigation

## Icons
- MUI Icons (Material Icons)
- VM states: CloudQueue, CheckCircle, Error, HourglassEmpty
