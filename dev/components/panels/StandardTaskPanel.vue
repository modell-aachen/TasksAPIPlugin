<template>
    <div v-show="isActive" class="overlay" v-on:click="requestClose">
        <div class="panel-overlay active" v-if="task">
                <div class="panel-wrapper active" v-on:click.stop>
                    <div class="tab-bar">
                        <span class="primary" v-on:click="requestClose">
                            <i class="fa fa-times"></i>
                        </span>
                        <span v-on:click="panelView('detail')" :class="activeTab('detail')">
                            <i class="fa fa-info-circle"></i>
                        </span>
                        <span v-on:click="panelView('attachment')" :class="activeTab('attachment')">
                            <i class="fa fa-files-o"></i>
                        </span>
                        <span v-on:click="panelView('changeset')" :class="activeTab('changeset')">
                            <i class="fa fa-clock-o"></i>
                        </span>
                    </div>
                    <div class="panel">
                        <component :is="view + '-panel-content'" :config="config"></component>
                    </div>
                </div>
        </div>
    </div>
</template>


<script>
import TaskPanelMixin from "../../mixins/TaskPanelMixin.vue";
import * as mutations from '../../store/mutation-types';

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
        }
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
    background-color: rgba(0,0,0,0.3);
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
    background: lightgray;
    .fa {
        font-size: 25px;
        padding: 4px;
    }
    span {
        color: darkgray;
        text-align: center;
        width: 50px;
        height: 50px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        .primary {
            width: 55px;
            bottom-border: 1px
        }
        &.active {
            background-color: darkgray;
            color: white;
        }
        &:hover {
            color: black;
            background-color: darkgray;
        }
    }
}
</style>
