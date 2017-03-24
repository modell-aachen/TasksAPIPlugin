<template>
    <transition name="toggle-panel">
    <div v-show="isActive" class="overlay flatskin-wrapped " v-on:click="requestClose">
        <div class="panel-overlay active">
                <div class="panel-wrapper active" :class="{priority: isPriority}" v-on:click.stop>
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
                        <component v-if="task" :is="view + '-panel-content'" :config="config"></component>
                    </div>
                    <div v-show="isLoading" style="background-color: rgba(255, 255, 255, 0.7); width:100%; height:100%; position:absolute; top:0; text-align:center">
                    <i class="fa fa-refresh fa-spin fa-5x fa-fw" style="position: relative; top:40%; color: #84878A"></i>
                    </div>
                    <transition name="fade">
                        <div v-if="$store.state.taskGrid.panelState.isDialog" class="dialog-overlay">
                            <div class="tab-bar">
                                <span class="primary" v-on:click.stop="cancelMoveTask">
                                    <i class="fa fa-times"></i>
                                </span>
                            </div>
                            <div class="content align-middle">
                                <h3 class="top-title">{{maketext("Move entry")}}</h3>
                                {{maketext("Choose a new context")}}
                                <select v-model="newContext">
                                    <option v-for="(context, name) in task.contexts" v-bind:value="context">
                                    {{ name }}
                                    </option>
                                </select>
                                <div class="row align-right">
                                    <div class="coloum" style="margin-right: 10px;">
                                        <span @click="cancelMoveTask" class="button">{{maketext("Cancel")}}</span>
                                    </div>
                                    <div class="coloum">
                                        <span @click="moveTask" class="button primary">{{maketext("Move entry")}}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </transition>
                </div>
        </div>
    </div>
    </transition>
</template>


<script>
import TaskPanelMixin from "../../mixins/TaskPanelMixin.vue";
import * as mutations from '../../store/mutation-types';

/* global window swal */
export default {
    mixins: [TaskPanelMixin],
    data() {
        return {
            newContext: ''
        };
    },
    computed: {
        view() {
            return this.$store.state.taskGrid.panelState.view;
        },
        isPriority() {
            if(this.task && this.task.fields["Prioritize"]) {
                if(this.task.fields["Prioritize"].value !== 'No') {
                    return true;
                }
            }
            return false;
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
        moveTask(){
            if(this.newContext == '') {
                return false;
            }
            let request = {
                id: this.task.id,
                Context: this.newContext
            };
            this.$store.dispatch('updateTask', {gridState: this.grid, request});
            this.$store.commit(mutations.CHANGE_PANEL_DIALOG_STATE, false);
            this.selectMove = false;
        },
        cancelMoveTask(){
            this.$store.commit(mutations.CHANGE_PANEL_DIALOG_STATE, false);
            this.context = '';
        },
        requestClose() {
            let swalConfig = {
                title: this.maketext("Are you sure?"),
                text: this.maketext("Your current changes are lost."),
                type: "warning",
                showCancelButton: true,
                confirmButtonColor: "#D83314",
                confirmButtonText: this.maketext("Confirm"),
                cancelButtonText: this.maketext("Cancel"),
                closeOnConfirm: true,
                closeOnCancel: true,
                allowEscapeKey: false
            };

            let self = this;
            if(this.isEditMode && !this.isNewTaskEditMode){
                swal(swalConfig, function(isConfirm){
                    if(isConfirm)
                        self.$store.dispatch("switchEditMode", false);
                });
            }
            else if(this.isNewTaskEditMode){
                swal(swalConfig, function(isConfirm){
                    if(isConfirm)
                        self.togglePanelStatus();
                });
            }
            else {
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
    background-color: rgba(0,0,0,0.5);
    >.panel-wrapper {
        border-left: 5px solid transparent;
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        background-color: transparent;
        min-width: 480px;
        width: 33%;
        &.priority {
            border-left: 5px solid #D83314;
        }
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
        font-size: 20px;
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
.fade-enter-active, .fade-leave-active {
  transition: opacity .3s ease;
}
.fade-enter, .fade-leave-to {
  opacity: 0;
}
div.dialog-overlay {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    .tab-bar{
        background-color: rgba(255, 255, 255, 0.90);
        span:hover{
            color: black;
            background-color: rgba(255, 255, 255, 0.90);
        }
    }
    .content {
        top: 0;
        width: 92%;
        position: absolute;
        padding: 61px 35px 40px 35px;
        left: 48px;
        h3 {
            padding: 10px 0;
        }
        select {
            margin: 11px 0;
        }
        div.row {
            margin: 10px 0;
        }
    }
}
</style>
