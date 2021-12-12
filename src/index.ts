import Koa from 'koa'
import serve from 'koa-static'
import mount from 'koa-mount'
import bodyParser from 'koa-bodyparser'
import { apiMw, frontEndApis } from './apis'
import { serveFrontend } from './frontend'
import { API_URI, DEV, FRONTEND_URI } from './const'

const PORT = 80

const srv = new Koa()
srv.use(async (ctx, next) => {
    // log all requests
    console.debug(ctx.request.method, ctx.url)
    // prevent cross-dir
    // @ts-ignore
    ctx.assert(!ctx.originalUrl.includes('..'), 400, 'cross-dir')
    await next()
})

// serve apis
srv.use(mount(API_URI, new Koa().use(bodyParser()).use(apiMw(frontEndApis))))

// serve shared files and front-end files
const serveFiles = serve('.', { hidden:true })
const serveFrontendPrefixed = mount(FRONTEND_URI.slice(0,-1), serveFrontend)
srv.use(async (ctx, next) => {
    if (ctx.method !== 'GET')
        return await next()
    if (ctx.url.endsWith('/'))
        return await serveFrontend(ctx,next)
    if (ctx.url.startsWith(FRONTEND_URI))
        return await serveFrontendPrefixed(ctx,next)
    await serveFiles(ctx,next)
})

srv.on('error', err => console.error('server error', err))
srv.listen(PORT, ()=> console.log('running on port', PORT, DEV, new Date().toLocaleString()))