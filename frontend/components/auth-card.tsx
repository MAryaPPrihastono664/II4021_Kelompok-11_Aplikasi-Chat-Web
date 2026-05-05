"use client";

import { useState, type FormEvent } from "react";

type Tab = "login" | "register";

type AuthCardProps = {
  onAuthenticated?: () => void;
};
const tabBaseClass =
  "auth-card-tab rounded-lg cursor-pointer border px-4 py-3 text-base font-semibold transition-[background,color,border-color] duration-200";
const tabInactiveClass =
  "border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50";
const tabActiveClass =
  "auth-card-tab active border-[#42B549] bg-[#42B549] text-white";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-inherit box-border transition-[border-color,box-shadow] duration-200 focus:outline-none focus:border-[#42B549] focus:shadow-[0_0_0_3px_rgba(66,181,73,0.1)]";

export function AuthCard({ onAuthenticated }: AuthCardProps) {
  const [tab, setTab] = useState<Tab>("login");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const onLoginSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onAuthenticated?.();
  };

  const onRegisterSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onAuthenticated?.();
  };

  return (
    <div className="auth-card-container min-h-[400px] w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-10 shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
      <header className="auth-card-header mb-6 text-center">
        <h2 className="auth-card-title m-0 text-3xl font-bold tracking-tight text-gray-900">
          A Chat Web App
        </h2>
        <p className="auth-card-subtitle mb-0 mt-2 text-gray-600">
          Masuk atau daftar untuk mulai.
        </p>
      </header>

      <div className="auth-card-tabs mb-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`${tabBaseClass} ${tab === "login" ? tabActiveClass : tabInactiveClass}`}
          data-tab="login"
          onClick={() => setTab("login")}
        >
          Masuk
        </button>
        <button
          type="button"
          className={`${tabBaseClass} ${tab === "register" ? tabActiveClass : tabInactiveClass}`}
          data-tab="register"
          onClick={() => setTab("register")}
        >
          Daftar
        </button>
      </div>

      <div className="auth-card-panels block">
        <form
          className="auth-card-panel block"
          data-panel="login"
          noValidate
          style={{ display: tab === "login" ? "block" : "none" }}
          onSubmit={onLoginSubmit}
        >
          <div className="auth-card-field mb-4 grid gap-2">
            <label className="font-medium text-gray-900">Email</label>
            <input
              type="email"
              name="email"
              required
              placeholder="nama@contoh.com"
              className={inputClass}
              autoComplete="email"
            />
            <span
              className="auth-card-error block min-h-5 text-sm text-red-600"
              data-error="email"
            />
          </div>
          <div className="auth-card-field mb-4 grid gap-2">
            <label className="font-medium text-gray-900">Password</label>
            <div className="auth-card-password-wrap relative">
              <input
                type={showLoginPassword ? "text" : "password"}
                name="password"
                required
                placeholder="••••••••"
                className={inputClass}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="auth-card-toggle-pass absolute right-3 top-1/2 inline-flex h-7 -translate-y-1/2 cursor-pointer items-center rounded-md border-0 bg-transparent px-2 text-sm text-gray-600 transition-colors duration-200 hover:text-[#42B549]"
                aria-label="Toggle password"
                onClick={() => setShowLoginPassword((v) => !v)}
              >
                <span className="toggle-text">
                  {showLoginPassword ? "Sembunyikan" : "Tampilkan"}
                </span>
              </button>
            </div>
            <span
              className="auth-card-error block min-h-5 text-sm text-red-600"
              data-error="password"
            />
          </div>
          <div className="auth-card-actions mt-6 flex justify-center">
            <button
              type="submit"
              className="auth-card-btn auth-card-btn-primary cursor-pointer rounded-lg border-0 bg-[#42B549] px-6 py-3 text-base font-semibold text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)] transition-[background-color,box-shadow] duration-200 font-inherit hover:bg-[#36933c] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
            >
              <span>Masuk</span>
            </button>
          </div>
          <div
            className="auth-card-form-error mt-2 min-h-5 text-center text-sm text-red-600"
            data-error="form"
          />
        </form>

        <form
          className="auth-card-panel block"
          data-panel="register"
          noValidate
          style={{ display: tab === "register" ? "block" : "none" }}
          onSubmit={onRegisterSubmit}
        >
          <div className="auth-card-field mb-4 grid gap-2">
            <label className="font-medium text-gray-900">Email</label>
            <input
              type="email"
              name="email"
              required
              placeholder="nama@contoh.com"
              className={inputClass}
              autoComplete="email"
            />
            <span
              className="auth-card-error block min-h-5 text-sm text-red-600"
              data-error="email"
            />
          </div>
          <div className="auth-card-field mb-4 grid gap-2">
            <label className="font-medium text-gray-900">Password</label>
            <div className="auth-card-password-wrap relative">
              <input
                type={showRegisterPassword ? "text" : "password"}
                name="password"
                required
                placeholder="••••••••"
                className={inputClass}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="auth-card-toggle-pass absolute right-3 top-1/2 inline-flex h-7 -translate-y-1/2 cursor-pointer items-center rounded-md border-0 bg-transparent px-2 text-sm text-gray-600 transition-colors duration-200 hover:text-[#42B549]"
                aria-label="Toggle password"
                onClick={() => setShowRegisterPassword((v) => !v)}
              >
                <span className="toggle-text">
                  {showRegisterPassword ? "Sembunyikan" : "Tampilkan"}
                </span>
              </button>
            </div>
            <span
              className="auth-card-error block min-h-5 text-sm text-red-600"
              data-error="password"
            />
          </div>
          <div className="auth-card-actions mt-6 flex justify-center">
            <button
              type="submit"
              className="auth-card-btn auth-card-btn-primary cursor-pointer rounded-lg border-0 bg-[#42B549] px-6 py-3 text-base font-semibold text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)] transition-[background-color,box-shadow] duration-200 font-inherit hover:bg-[#36933c] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
            >
              <span>Daftar</span>
            </button>
          </div>
          <div
            className="auth-card-form-error mt-2 min-h-5 text-center text-sm text-red-600"
            data-error="form"
          />
        </form>
      </div>
    </div>
  );
}
