"use client";

import messages from "@clemperl/i18n/messages/admin/fr.json";
import { Button, Field } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { createFirstAdministrator } from "./actions";
import { INITIAL_SETUP_STATE } from "./types/setup-state.interface";

export function SetupForm(): JSX.Element {
    const t = messages.setup;
    const [state, action, pending] = useActionState(
        createFirstAdministrator,
        INITIAL_SETUP_STATE,
    );

    return (
        <form action={action} className="mt-10 flex flex-col gap-6">
            <Field label={t.name} name="name" required />
            <Field label={t.email} name="email" type="email" required />
            <Field label={t.password} name="password" type="password" required minLength={8} />
            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message[0]}
                </p>
            )}
            <Button type="submit" full disabled={pending} className="mt-2">
                {pending ? t.submitting : t.submit}
            </Button>
        </form>
    );
}
