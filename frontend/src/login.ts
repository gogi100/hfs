// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { apiCall } from './api'
import { state } from './state'
import { alertDialog, newDialog } from './dialog'
import { hIcon, srpSequence, working } from './misc'
import { useNavigate } from 'react-router-dom'
import { createElement as h, useEffect, useRef } from 'react'
import { t, tComponent, useI18N } from './i18n'

async function login(username:string, password:string) {
    const stopWorking = working()
    return srpSequence(username, password, apiCall).then(res => {
        stopWorking()
        sessionRefresher(res)
        state.loginRequired = false
        return res
    }, (err: any) => {
        stopWorking()
        throw Error(err.message === 'trust' ? t('login_untrusted', "Login aborted: server identity cannot be trusted")
            : err.code === 401 ? t('login_bad_credentials', "Invalid credentials")
                : err.code === 409 ? t('login_bad_cookies', "Cookies not working - login failed")
                    : t(err.message))
    })
}

sessionRefresher((window as any).HFS.session)

function sessionRefresher(response: any) {
    if (!response) return
    const { exp, username, adminUrl } = response
    state.username = username
    state.adminUrl = adminUrl
    if (!username || !exp) return
    const delta = new Date(exp).getTime() - Date.now()
    const t = Math.min(delta - 30_000, 600_000)
    console.debug('session refresh in', Math.round(t/1000))
    setTimeout(() => apiCall('refresh_session').then(sessionRefresher), t)
}

export function logout(){
    return apiCall('logout').catch(res => {
        if (res.code === 401) // we expect 401
            state.username = ''
        else
            throw res
    })
}

export async function loginDialog(navigate: ReturnType<typeof useNavigate>) {
    return new Promise(resolve => {
        const closeDialog = newDialog({
            className: 'dialog-login',
            icon: () => hIcon('login'),
            onClose: resolve,
            title: tComponent("Login"),
            Content() {
                const usrRef = useRef<HTMLInputElement>()
                const pwdRef = useRef<HTMLInputElement>()
                useEffect(() => {
                    setTimeout(() => usrRef.current?.focus()) // setTimeout workarounds problem due to double-mount while in dev
                }, [])
                const {t} = useI18N() // this dialog can be displayed before anything else, accessing protected folder, and needs to be rendered after languages loading
                return h('form', {
                    onSubmit(ev:any) {
                        ev.preventDefault()
                        go()
                    }
                },
                    h('div', { className: 'field' },
                        h('label', { htmlFor: 'username' }, t`Username`),
                        h('input', {
                            ref: usrRef,
                            name: 'username',
                            autoComplete: 'username',
                            required: true,
                            onKeyDown
                        }),
                    ),
                    h('div', { className: 'field' },
                        h('label', { htmlFor: 'password' }, t`Password`),
                        h('input', {
                            ref: pwdRef,
                            name: 'password',
                            type: 'password',
                            autoComplete: 'current-password',
                            required: true,
                            onKeyDown
                        }),
                    ),
                    h('div', { style: { textAlign: 'right' } },
                        h('button', { type: 'submit' }, t`Continue`)),
                )

                function onKeyDown(ev: KeyboardEvent) {
                    const { key } = ev
                    if (key === 'Escape')
                        return closeDialog(null)
                    if (key === 'Enter')
                        return go()
                }

                async function go(ev?: Event) {
                    ev?.stopPropagation()
                    const usr = usrRef.current?.value
                    const pwd = pwdRef.current?.value
                    if (!usr || !pwd) return
                    try {
                        const res = await login(usr, pwd)
                        closeDialog()
                        if (res?.redirect)
                            navigate(res.redirect)
                    } catch (err: any) {
                        await alertDialog(err)
                        usrRef.current?.focus()
                    }
                }

            }
        })
    })
}
