import { defineAddon, type PlayerSnapshot, type QueueSnapshot } from '@pulsesync/addon-sdk'
import config from '../addon.config.mjs'
import { settings } from './settings'
import { startInterface } from './interface.js'
import './style.css'

export default defineAddon({
    id: config.id,
    name: config.name,
    settings,
    async start(host) {
        let snapshot: PlayerSnapshot | null = null
        let queue: QueueSnapshot = {items: [], currentIndex: null}
        const trackListeners = new Set<() => void>()
        const queueListeners = new Set<() => void>()
        const emitTrack = () => { for (const fn of trackListeners) fn() }
        const emitQueue = () => { for (const fn of queueListeners) fn() }
        let playerRevision = 0, queueRevision = 0
        host.onCleanup(host.player.onChange(value => {playerRevision++;snapshot=value;emitTrack()}))
        host.onCleanup(host.player.onQueueChange(value => {queueRevision++;queue=value;emitQueue()}))
        const revisions = [playerRevision, queueRevision]
        const [initial, initialQueue, login] = await Promise.all([host.player.getSnapshot().catch(error=>{host.logger.warn('Initial player snapshot unavailable',error);return null}), host.client.getQueueSnapshot().catch(error=>{host.logger.warn('Initial queue snapshot unavailable',error);return {items:[],currentIndex:null} as QueueSnapshot}), host.client.getUserLogin().catch(()=>null)])
        if(host.signal.aborted) return
        if(playerRevision===revisions[0]) snapshot=initial
        if(queueRevision===revisions[1]) queue=initialQueue
        const subscribe=(listeners:Set<()=>void>, fn:()=>void)=>{listeners.add(fn);return ()=>listeners.delete(fn)}
        const report=(operation:Promise<unknown>)=>{void operation.catch(error=>{if(!host.signal.aborted)host.logger.warn('SpotGlass action failed',error)})}
        const bridge={
            getSettings:()=>host.settings,
            storageScope:login || "local",
            getCurrentTrack:()=>snapshot?.track,
            getProgress:()=>snapshot?.progress,
            getQueueSnapshot:()=>queue,
            isPlaying:()=>snapshot?.isPlaying,
            onCurrentTrackChange:(fn:()=>void)=>subscribe(trackListeners,fn),
            onQueueChange:(fn:()=>void)=>subscribe(queueListeners,fn),
            getNativeLyrics:(id:string,type:'LRC'|'TEXT',signal:AbortSignal)=>(signal.aborted ? Promise.resolve(null) : host.resources.getLyrics(id,type)),
            fetch:(url:string,options:RequestInit)=>host.net.fetch(url,options),
            playVibe:(params:Parameters<typeof host.client.playVibe>[0])=>host.client.playVibe(params),
            togglePlayPause:()=>report(host.client.togglePlayPause()),
            next:()=>report(host.client.next()),
            previous:()=>report(host.client.previous()),
            showToast:(message:string)=>report(host.notifications.info(message)),
        }
        host.onCleanup(startInterface(bridge))
        host.onCleanup(()=>{trackListeners.clear();queueListeners.clear()})
    },
})
