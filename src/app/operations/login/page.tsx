import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  getOperationsAccessToken,
  isOperationsSessionValid,
  operationsCookieName,
} from "@/server/operations/auth";

export const metadata: Metadata = { title: "Operations sign in" };
export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsLoginPage({
  searchParams,
}: LoginPageProps) {
  const cookieStore = await cookies();

  if (isOperationsSessionValid(cookieStore.get(operationsCookieName)?.value)) {
    redirect("/operations");
  }

  const { error } = await searchParams;
  const configured = Boolean(getOperationsAccessToken());

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-16 sm:px-6"
    >
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <p className="text-sm font-semibold text-amber-700">
          Restricted operations
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Data review sign in
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This private area contains provisional transport records. Nothing
          shown here is public commuter guidance.
        </p>

        {!configured ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
          >
            Set <code>OPERATIONS_ACCESS_TOKEN</code> to a secret containing at
            least 32 characters, then restart the application.
          </div>
        ) : (
          <form action="/operations/session" method="post" className="mt-6">
            <label
              htmlFor="operations-access-token"
              className="text-sm font-semibold text-slate-800"
            >
              Operations access token
            </label>
            <input
              id="operations-access-token"
              name="accessToken"
              type="password"
              required
              autoComplete="current-password"
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
            />

            {error === "invalid" ? (
              <p role="alert" className="mt-3 text-sm text-red-700">
                The access token was not accepted.
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-5 min-h-12 w-full rounded-xl bg-slate-950 px-4 font-semibold text-white transition hover:bg-slate-800 focus:ring-4 focus:ring-slate-200 focus:outline-none"
            >
              Open data review
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
