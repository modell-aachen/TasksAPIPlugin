<template>
    <transition name="toggle-panel">
    <div v-show="isActive" class="overlay" v-on:click="requestClose">
        <div class="panel-overlay active" v-if="task">
                <div class="panel-wrapper active" v-on:click.stop>
                    <div class="tab-bar">
                        <span class="primary" v-on:click="requestClose">
                            <i class="fa fa-times"></i>
                        </span>
                        <span v-show="!isEditMode" v-on:click="panelView('detail')" :class="activeTab('detail')">
                            <i class="fa fa-info-circle"></i>
                        </span>
                        <span v-show="!isEditMode" v-on:click="panelView('attachment')" :class="activeTab('attachment')">
                            <i class="fa fa-files-o"></i>
                        </span>
                        <span v-show="!isEditMode" v-on:click="panelView('changeset')" :class="activeTab('changeset')">
                            <i class="fa fa-clock-o"></i>
                        </span>
                    </div>
                    <div class="panel">
                        <component :is="view + '-panel-content'" :config="config"></component>
                    </div>
                    <div v-show="isLoading" style="background-color: rgba(255, 255, 255, 0.7); width:100%; height:100%; position:absolute; top:0; text-align:center">
                    <i class="fa fa-refresh fa-spin fa-5x fa-fw" style="position: relative; top:40%"></i>
        </div>
                </div>
        </div>
    </div>
    </transition>
</template>


<script>
import TaskPanelMixin from "../../mixins/TaskPanelMixin.vue";
import * as mutations from '../../store/mutation-types';

/* global window */
export default {
    mixins: [TaskPanelMixin],
    computed: {
        view() {
            return this.$store.state.taskGrid.panelState.view;
        }
    },
    methods: {
        panelView(view) {
            this.$store.commit(mutations.SET_PANEL_VIEW, {view});
        },
        activeTab(tab) {
            if(this.view === tab) {
                return 'active';
            }
            return '';
        },
        requestClose() {
            if(this.isEditMode){
                this.$store.dispatch("switchEditMode", false);
            }
            else{
                this.togglePanelStatus();
            }
        },
        doKeyAction(event) {
            switch(event.keyCode) {
                case 27:
                    this.isActive ? this.requestClose() : null;
                    break;
                case 39:
                    this.isActive ? this.next() : null;
                    break;
                case 37:
                    this.isActive ? this.prev() : null;
                    break;
            }
        }
    },
    created () {
        window.addEventListener('keyup', this.doKeyAction);
    },
    beforeDestroy() {
        window.removeEventListerner('keyup', this.doKeyAction);
    }
};
</script>

<style lang="sass">
.panel-overlay {
    display: block;
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 999;
    background-color: rgba(0,0,0,0.13);
    >.panel-wrapper {
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        background-color: transparent;
        min-width: 33%;
        >.panel {
            bottom: 0px;
            position: absolute;
            top: 0;
            left: 48px;
            background-color: #fff;
            width: calc(100% - 48px);
            overflow-x: hidden;
        }
        >.active {
            transform: translate3d(0,0,0);
        }
    }
}
.tab-bar {
    display: -weblit-flex;
    display: flex;
    -webkit-flex-direction: column;
    flex-direction: column;
    justify-content: flex-start;
    flex: 1;
    height: 100%;
    background: #E5E8EB;
    .fa {
        font-size: 25px;
        padding: 4px;
    }
    span {
        color: #84878A;
        text-align: center;
        width: 50px;
        height: 50px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        transition: all .4s ease;
        &:first-child{
            height: 60px;
        }
        .primary {
            width: 55px;
            bottom-border: 1px;
        }
        &.active, &:hover{
            background-color: #84878A;
            color: white;
            i.fa{
                transform: scale(1.3,1.3);
            }
        }
    }
}

.toggle-panel-enter-active, .toggle-panel-leave-active {
  transition: opacity .3s ease;
  .panel-wrapper {
    transition: transform .3s ease;
  }
}
.toggle-panel-enter, .toggle-panel-leave-active {
  opacity: 0;
  .panel-wrapper {
    transform: translateX(700px);
  }
}
</style>
