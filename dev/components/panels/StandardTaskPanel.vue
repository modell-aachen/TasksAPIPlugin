<template>
    <div v-show="isActive" class="overlay">
        <div class="task-overlay active">
                <div class="panel-wrapper active">
                    <div class="tab-bar">
                        <span v-on:click="togglePanelStatus">
                            <i class="fa fa-times"></i>
                        </span>
                    </div>
                    <div class="panel">
                        <h2>{{displayValue("Title")}}</h2>
                        <p>{{displayValue("Description")}}</p>
                    </div>
                </div>
        </div>
    </div>
</template>


<script>
import TaskPanelMixin from "../../mixins/TaskPanelMixin.vue";
export default {
    mixins: [TaskPanelMixin]
};
</script>

<style lang="sass">
.task-overlay {
    display: block;
    >.panel-wrapper>.panel {
        bottom: 0px;
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
    span {
        color: darkgray;
        text-align: center;
        width: 50px;
        height: 50px;
    }
}
</style>
