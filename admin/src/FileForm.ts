// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { state } from './state'
import { createElement as h, ReactNode, useEffect, useMemo, useState } from 'react'
import { Alert, Box, MenuItem, MenuList, } from '@mui/material'
import {
    BoolField,
    DisplayField,
    Field,
    FieldProps,
    Form,
    MultiSelectField,
    SelectField,
    StringField
} from '@hfs/mui-grid-form'
import { apiCall, useApiEx } from './api'
import { formatBytes, IconBtn, isEqualLax, modifiedSx, newDialog, onlyTruthy, prefix } from './misc'
import { reloadVfs, VfsNode, VfsPerms, Who } from './VfsPage'
import md from './md'
import _ from 'lodash'
import FileField from './FileField'
import { alertDialog, useDialogBarColors } from './dialog'
import yaml from 'yaml'
import { Check, ContentCopy, Delete, Edit } from '@mui/icons-material'

interface Account { username: string }

interface FileFormProps {
    file: VfsNode
    anyMask?: boolean
    defaultPerms: VfsPerms
    addToBar?: ReactNode
    urls: string[] | false
}

export default function FileForm({ file, anyMask, defaultPerms, addToBar, urls }: FileFormProps) {
    const { parent, children, isRoot, ...rest } = file
    const [values, setValues] = useState(rest)
    useEffect(() => {
        setValues(Object.assign({ can_see: null, can_read: null, can_upload: null, can_delete: null }, rest))
    }, [file]) //eslint-disable-line

    const { source } = file
    const isDir = file.type === 'folder'
    const hasSource = source !== undefined // we need a boolean
    const realFolder = hasSource && isDir
    const inheritedPerms = useMemo(() => {
        const ret = {}
        let run = parent
        while (run) {
            _.defaults(ret, run)
            run = run.parent
        }
        return _.defaults(ret, defaultPerms)
    }, [parent])
    const showTimestamps = hasSource && Boolean(values.ctime)
    const showSize = hasSource && !realFolder
    const barColors = useDialogBarColors()

    const { data, element } = useApiEx<{ list: Account[] }>('get_accounts')
    if (element || !data)
        return element
    const allAccounts = data.list
    const can_read = (values.can_read ?? inheritedPerms.can_read)

    return h(Form, {
        values,
        set(v, k) {
            if (k === 'link') return
            setValues({ ...values, [k]: v })
        },
        barSx: { gap: 2, width: '100%', ...barColors },
        stickyBar: true,
        addToBar: [
            !isRoot && h(IconBtn, {
                icon: Delete,
                title: "Delete",
                confirm: "Delete?",
                onClick: () => apiCall('del_vfs', { uris: [file.id] }).then(() => reloadVfs()),
            }),
            addToBar
        ],
        onError: alertDialog,
        save: {
            sx: modifiedSx(!isEqualLax(values, file)),
            async onClick() {
                const props = { ...values }
                if (!props.masks)
                    props.masks = null // undefined cannot be serialized
                await apiCall('set_vfs', {
                    uri: values.id,
                    props,
                })
                if (props.name !== file.name) // when the name changes, the id of the selected file is changing too, and we have to update it in the state if we want it to be correctly re-selected after reload
                    state.selectedFiles[0].id = file.id.slice(0, -file.name.length) + props.name
                reloadVfs()
            }
        },
        fields: [
            isRoot ? h(Alert,{ severity: 'info' }, "This is Home, the root of your shared files. Options set here will be applied to all files.")
                : { k: 'name', required: true, helperText: source && "You can decide a name that's different from the one on your disk" },
            { k: 'id', comp: LinkField, urls },
            { k: 'source', label: "Source on disk", comp: FileField, files: !isDir, folders: isDir, multiline: true,
                placeholder: "Not on disk, this is a virtual folder",
            },
            perm('can_read', "Who can download", "Note: who can't download won't see it in the list"),
            can_read && perm('can_see', "Who can see", "You can hide and keep it downloadable if you have a direct link",
                { accounts: Array.isArray(can_read) ? allAccounts.filter(x => can_read.includes(x.username)) : undefined }),
            isDir && perm('can_upload', "Who can upload", hasSource ? '' : "Works only on folders with source"),
            isDir && perm('can_delete', "Who can delete", hasSource ? '' : "Works only on folders with source"),
            showSize && { k: 'size', comp: DisplayField, lg: 4, toField: formatBytes },
            showTimestamps && { k: 'ctime', comp: DisplayField, md: 6, lg: showSize && 4, label: 'Created', toField: formatTimestamp },
            showTimestamps && { k: 'mtime', comp: DisplayField, md: 6, lg: showSize && 4, label: 'Modified', toField: formatTimestamp },
            file.website && { k: 'default', comp: BoolField, label:"Serve index.html",
                toField: Boolean, fromField: (v:boolean) => v ? 'index.html' : null,
                helperText: md("This folder may be a website because contains `index.html`. Enabling this will show the website instead of the list of files.")
            },
            isDir && { k: 'masks', multiline: true, lg: true,
                toField: yaml.stringify, fromField: v => v ? yaml.parse(v) : undefined,
                sx: { '& textarea': { fontFamily: 'monospace' } },
                helperText: "Special field, leave empty unless you know what you are doing. YAML syntax." }
        ]
    })

    function perm(perm: keyof typeof inheritedPerms, label: string, helperText='', { accounts=allAccounts, ...props }={}) {
        return { showInherited: anyMask, // with masks, you may need to set a permission to override the mask
            k: perm, lg: 6, comp: WhoField, parent, accounts, label, inherit: inheritedPerms[perm], helperText, ...props }
    }
}

function formatTimestamp(x: string) {
    return x ? new Date(x).toLocaleString() : '-'
}

interface WhoFieldProps extends FieldProps<Who> { accounts: Account[] }
function WhoField({ value, onChange, parent, inherit, accounts, helperText, showInherited, ...rest }: WhoFieldProps) {
    const options = useMemo(() =>
        onlyTruthy([
            { value: null, label: (parent ? "Same as parent: " : "Default: " ) + who2desc(inherit) },
            { value: true },
            { value: false },
            { value: '*' },
            { value: [], label: "Select accounts" },
        // don't offer inherited value twice, unless it was already selected, or it is forced
        ].map(x => (x.value === value || showInherited || x.value !== inherit)
            && { label: _.capitalize(who2desc(x.value)), ...x })), // default label
    [inherit, parent, value])

    const arrayMode = Array.isArray(value)
    return h('div', {},
        h(SelectField as Field<Who>, {
            ...rest,
            helperText: !arrayMode && helperText,
            value: arrayMode ? [] : value,
            onChange(v, { was, event }) {
                onChange(v, { was , event })
            },
            options
        }),
        arrayMode && h(MultiSelectField as Field<string[]>, {
            label: accounts?.length ? "Choose accounts for " + rest.label : "You didn't create any account yet",
            value,
            onChange,
            helperText,
            options: accounts?.map(a => ({ value: a.username, label: a.username })) || [],
        })
    )
}

function who2desc(who: any) {
    return who === false ? "no one"
        : who === true ? "anyone"
            : who === '*' ? "any account (login required)"
                : Array.isArray(who) ? who.join(', ')
                    : "*UNKNOWN*" + JSON.stringify(who)
}

interface LinkFieldProps extends FieldProps<string> {
    urls: string[]
}
function LinkField({ value, urls, }: LinkFieldProps) {
    const { data, error, reload } = useApiEx('get_config', { only: ['base_url'] })
    const base: string | undefined = data?.base_url
    const link = (base || (urls ? urls[0] : '')) + encodeURI(value||'')
    return h(Box, { display: 'flex', },
        h(DisplayField, {
            label: "Link", value: link,
            error,
            end: h(Box, {},
                h(IconBtn, {
                    icon: ContentCopy,
                    title: "Copy",
                    onClick: () => navigator.clipboard.writeText(link)
                }),
                h(IconBtn, {
                    icon: Edit,
                    title: "Change",
                    onClick: edit,
                }),
            )
        }),
    )

    function edit() {
        const proto = new URL(urls[0]).protocol + '//'
        newDialog({
            title: "Change link",
            onClose: reload,
            Content() {
                const [v, setV] = useState(base)
                return h(Box, { display: 'flex', flexDirection: 'column' },
                    h(Box, { mb: 2 }, "You can choose a different base address for your links"),
                    h(MenuList, {},
                        urls.map(u => h(MenuItem, {
                            key: u,
                            selected: u === v,
                            onClick: () => set(u),
                        }, u, u === v && h(Check, { sx: { ml: 2 } })))
                    ),
                    h(StringField, {
                        label: "Custom IP or domain",
                        helperText: md("You can type any address but *you* are responsible to make the address work.\nThis functionality is just to help you copy the link in case you have a domain or a complex network configuration."),
                        value: !v || urls.includes(v) ? '' : v.slice(proto.length),
                        onChange: v => set(prefix(proto, v)),
                        onTyping: v => /^[-\w.[\]:]*$/.test(v),
                        start: proto,
                        sx: { mt: 2 }
                    }),
                )

                async function set(u: string) {
                    await apiCall('set_config', { values: { base_url: u } })
                    setV(u)
                }
            }
        })
    }
}