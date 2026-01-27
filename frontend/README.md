# VM Portal Frontend

React + TypeScript frontend for internal Vietnamese VM management portal.

## Tech Stack

- **React 18** with TypeScript
- **Vite** - Fast build tool
- **Material UI (MUI)** - Component library
- **React Router** - Navigation
- **Axios** - HTTP client

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run typecheck
```

## Environment Variables

Create a `.env` file in the frontend directory:

```
VITE_API_URL=http://localhost:8000/api
```

## Features

- **Authentication**: Login with JWT token storage
- **Dashboard**: VM statistics overview
- **VM Creation**: Form to create new VMs with configurable specs
- **VM List**: Table view with auto-refresh for pending VMs
- **Responsive**: Mobile-friendly layout with collapsible sidebar

## Vietnamese UI

All user-facing text is in Vietnamese (tiếng Việt):
- Login: "Đăng Nhập"
- Dashboard: "Tổng quan"
- Create VM: "Tạo máy ảo"
- VM List: "Danh sách VM"

## Development

The app runs on `http://localhost:5173` with proxy to backend API at `http://localhost:8000`.

### Directory Structure

```
src/
├── services/          # API client and auth service
├── hooks/             # React hooks (auth context)
├── components/        # Reusable components
├── pages/            # Page components
├── app.tsx           # Router and theme setup
└── main.tsx          # Entry point
```

## Design System

- **Primary Color**: #1976D2 (Blue)
- **Success**: #2E7D32 (Green)
- **Warning**: #ED6C02 (Orange)
- **Error**: #D32F2F (Red)
- **Font**: Inter
