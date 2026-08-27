# Dayflow - Modern HR Management Platform

[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-purple.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.x-cyan.svg)](https://tailwindcss.com/)

Dayflow is a comprehensive Human Resource Management System (HRMS) built with modern web technologies. It streamlines HR operations with comprehensive employee management, attendance tracking, leave management, and payroll visibility—all in one platform.

## 🚀 Features

### Core Functionality
- **📊 Dashboard** - Comprehensive overview with key metrics and analytics
- **👥 Employee Management** - Complete employee database with profiles and information
- **⏰ Attendance Tracking** - Real-time attendance monitoring and reporting
- **🏖️ Leave Management** - Leave requests, approvals, and balance tracking
- **💰 Payroll System** - Salary information and payroll management
- **⏱️ Time Off Management** - Vacation and time-off request handling

### User Experience
- **🎨 Modern UI/UX** - Clean, intuitive interface built with shadcn/ui components
- **📱 Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices
- **🔐 Authentication System** - Secure login and user management
- **✏️ Profile Management** - Comprehensive user profiles with editing capabilities
- **🌙 Dark Mode Support** - Modern theming system
- **⚡ Fast Performance** - Built with Vite for lightning-fast development and build times

### Technical Features
- **🔧 Component Library** - Reusable UI components with shadcn/ui
- **📋 Form Handling** - Advanced form management with validation
- **🎯 State Management** - Efficient state handling with React Context
- **🔄 Real-time Updates** - Dynamic data updates without page refreshes
- **📊 Data Visualization** - Charts and analytics for HR insights

## 🛠️ Tech Stack

- **Frontend Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui, Radix UI
- **Icons:** Lucide React
- **Backend:** Supabase (Postgres, Auth, Row Level Security)
- **Data Layer:** TanStack React Query (server state, caching, mutations)
- **Form Handling:** React Hook Form
- **State Management:** React Context (auth) + React Query (server data)
- **Date Handling:** date-fns
- **Package Manager:** npm/bun

## 📦 Installation

### Prerequisites
- Node.js 18+ or Bun runtime
- npm, yarn, or bun package manager

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/BLx-Ankush/HRMS.git
   cd HRMS
   ```

2. **Install dependencies**
   ```bash
   # Using npm
   npm install
   
   # Using bun (recommended)
   bun install
   ```

3. **Start the development server**
   ```bash
   # Using npm
   npm run dev
   
   # Using bun
   bun run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:8080` to view the application

## 🗄️ Backend Setup (Supabase — required for real data)

This app runs on **live Supabase data only** — there are no mock arrays or hardcoded
records in the UI. Every page (Dashboard, Employees, Attendance, Leave, Time Off,
Payroll, Salary Structure, Profile) reads and writes through React Query hooks in
`src/hooks/hrms.ts`, backed by Supabase Postgres + Auth.

> HRMS2 uses its **own dedicated Supabase project** (separate from any other HRMS
> instance) because it adds the `time_off`, `employee_salaries`, and
> `company_salary_structure` tables.

1. **Create a Supabase project** at [supabase.com](https://supabase.com) and note its
   project URL and API keys (Project Settings → API).

2. **Apply the schema.** In the Supabase SQL Editor, run
   `supabase/migrations/0001_init.sql` (tables, types, triggers, RLS policies),
   then `supabase/migrations/0002_realtime.sql` (enables live updates so the
   admin and employee views stay in sync in real time).

3. **Configure environment variables.** Copy `.env.example` to `.env` and fill in both
   the frontend keys and the server-only keys (the seed script reads `.env`):
   ```bash
   cp .env.example .env
   ```
   ```env
   # Frontend — safe to expose (Vite only ships VITE_-prefixed vars to the browser)
   VITE_SUPABASE_URL="https://YOUR-ref.supabase.co"
   VITE_SUPABASE_ANON_KEY="your-anon-or-publishable-key"

   # Server-only — used ONLY by scripts/seed-users.mjs. Never prefix with VITE_.
   SUPABASE_URL="https://YOUR-ref.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-secret-key"
   ```
   `.env` is gitignored — never commit real keys.

4. **Create the demo auth users** (admin + employee). This must run *before* the SQL
   seed, because `seed.sql` fleshes out the profiles those users create:
   ```bash
   node --env-file=.env scripts/seed-users.mjs
   ```

5. **Seed the rest of the data.** In the SQL Editor, run `supabase/seed.sql`
   (roster, attendance, leave, payroll, salary structure).

6. **Run the app** (`npm run dev`) and sign in with the demo accounts below.

## 🌐 Live Demo

### Deployment
The application is deployed and live on **Vercel** for easy access and testing.

**🔗 Live URL:** [https://hrms-2-virid.vercel.app/](https://hrms-2-virid.vercel.app/)

### Demo Accounts
We've created demo accounts for you to explore all features without setting up your own data:

#### 👨‍💼 Admin Access
- **Role:** Administrator
- **Access:** Full system access including employee management, payroll, and admin settings
- **Features:** Complete HR dashboard, analytics, and administrative controls
- **Email|Password:** admin@dayflow.com | admin123
  
#### 👤 Employee Access  
- **Role:** Employee
- **Access:** Personal dashboard, attendance tracking, leave requests, and profile management
- **Features:** Employee self-service portal and personal HR tools
- **Email|Password:** employee@dayflow.com | employee123
  
*Demo credentials are available on the sign-in page*

### 🚀 Future Enhancements
This project is under active development! Upcoming features and improvements include:
- Advanced analytics and reporting
- Mobile app development  
- Integration with third-party HR tools
- Enhanced security features
- Multi-language support
- Advanced workflow automation

*Stay tuned for exciting updates and new features!*


## 🤖 WebMCP Agent (Cooperative Human + AI)

This app is also a **WebMCP Challenge** entry. The admin's core workflows —
adding/updating employees and approving/rejecting leave — are exposed as WebMCP
tools on `document.modelContext`, so a browser-native AI agent can operate the
*real* application. Every change pauses on a human-approval dialog: **the agent
drafts, the human commits.** There's also an in-page, bring-your-own-key agent so
the flow is reproducible in any browser with no secret shipped in the frontend.

See **[WEBMCP.md](./WEBMCP.md)** for the architecture, tool list, security model,
and a step-by-step demo script.

## 🎯 Usage

### Getting Started
1. **Landing Page:** Visit the home page to learn about Dayflow's features
2. **Authentication:** Sign in with demo credentials or create a new account
3. **Dashboard:** Access the main dashboard for an overview of HR metrics
4. **Navigation:** Use the sidebar to navigate between different modules

### Key Modules

#### Employee Management
- Add new employees with complete information
- View employee directory with search and filter options
- Manage employee profiles and personal details

#### Attendance System
- Clock in/out functionality
- View attendance history and reports
- Track working hours and overtime

#### Leave Management
- Submit leave requests
- Manager approval workflow
- Leave balance tracking
- Calendar view of team availability

#### Payroll & Salary
- View salary information
- Download pay slips
- Tax and benefits information
- Payroll processing tools

#### Profile Management
- Edit personal information (mobile, location)
- Manage private information (emergency contacts, etc.)
- Update skills and about section
- Upload resume and documents

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── layout/         # Layout components (sidebar, navigation)
│   └── NavLink.tsx     # Navigation components
├── contexts/           # React Context providers
│   └── AuthContext.tsx # Authentication context
├── hooks/              # Custom React hooks
│   ├── use-mobile.tsx  # Mobile detection hook
│   └── use-toast.ts    # Toast notification hook
├── lib/                # Utility functions
│   └── utils.ts        # Common utilities
├── pages/              # Main application pages
│   ├── Dashboard.tsx   # Main dashboard
│   ├── Employees.tsx   # Employee management
│   ├── Attendance.tsx  # Attendance tracking
│   ├── Leave.tsx       # Leave management
│   ├── Payroll.tsx     # Payroll system
│   ├── Profile.tsx     # User profile
│   ├── TimeOff.tsx     # Time off management
│   ├── SalaryInfo.tsx  # Salary information
│   ├── SignIn.tsx      # Login page
│   ├── SignUp.tsx      # Registration page
│   └── Index.tsx       # Landing page
├── App.tsx             # Main application component
├── main.tsx           # Application entry point
└── index.css          # Global styles
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Code Quality
- **TypeScript** - Full type safety
- **ESLint** - Code linting and formatting
- **Component Structure** - Modular, reusable components
- **Responsive Design** - Mobile-first approach

## 🎨 Customization

### Theming
The application uses Tailwind CSS with a custom design system. You can customize:
- Color schemes in `tailwind.config.ts`
- Component styles in individual component files
- Global styles in `src/index.css`

### Components
All UI components are built with shadcn/ui and can be customized:
- Modify existing components in `src/components/ui/`
- Add new components using the shadcn CLI
- Customize styling with Tailwind utilities

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write descriptive commit messages
- Add proper documentation for new features
- Ensure responsive design compatibility
- Test on multiple browsers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for the beautiful UI components
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [Lucide](https://lucide.dev/) for the icon set
- [Radix UI](https://www.radix-ui.com/) for accessible component primitives

## 📞 Support

If you have any questions or need help, please:
- Open an issue on GitHub
- Contact the development team
- Check the documentation

---

**Built with ❤️ by the Team: " THE HONOURED ONES"**
